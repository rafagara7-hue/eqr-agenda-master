-- ============================================================
-- EQR AGENDA MASTER — Script consolidado de setup
-- Execute no Supabase Dashboard: SQL Editor → New query → Cole tudo → Run
-- URL: https://supabase.com/dashboard/project/xdirvicefwxmasrdoqpc/sql/new
-- ============================================================


-- ============================================================
-- MIGRATION 0001: members
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.members (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  slug          TEXT          NOT NULL UNIQUE,
  color         TEXT          NOT NULL,
  color_hex     TEXT          NOT NULL,
  role          TEXT          NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  avatar_url    TEXT,
  google_linked BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_members_user_id ON public.members(user_id);
CREATE INDEX idx_members_slug ON public.members(slug);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0002: events
-- ============================================================

CREATE TABLE public.recurrence_rules (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  freq         TEXT      NOT NULL CHECK (freq IN ('daily', 'weekly', 'monthly', 'yearly')),
  interval     INTEGER   NOT NULL DEFAULT 1 CHECK (interval > 0),
  by_day       TEXT[],
  by_month_day INTEGER[],
  by_month     INTEGER[],
  count        INTEGER CHECK (count > 0),
  until        TIMESTAMPTZ,
  rrule_string TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.events (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                 UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_by                UUID        NOT NULL REFERENCES public.members(id),
  title                     TEXT        NOT NULL,
  description               TEXT,
  location                  TEXT,
  start_at                  TIMESTAMPTZ NOT NULL,
  end_at                    TIMESTAMPTZ NOT NULL,
  all_day                   BOOLEAN     NOT NULL DEFAULT FALSE,
  status                    TEXT        NOT NULL DEFAULT 'confirmed'
                            CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  visibility                TEXT        NOT NULL DEFAULT 'private'
                            CHECK (visibility IN ('public', 'private')),
  recurrence_id             UUID        REFERENCES public.recurrence_rules(id) ON DELETE SET NULL,
  recurrence_exception_date TIMESTAMPTZ,
  is_recurrence_root        BOOLEAN     NOT NULL DEFAULT FALSE,
  google_event_id           TEXT,
  sync_status               TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (sync_status IN ('pending', 'synced', 'failed', 'conflict', 'local_only')),
  sync_error                TEXT,
  last_synced_at            TIMESTAMPTZ,
  color_override            TEXT,
  metadata                  JSONB       NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT check_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX idx_events_member_id    ON public.events(member_id);
CREATE INDEX idx_events_start_at     ON public.events(start_at);
CREATE INDEX idx_events_end_at       ON public.events(end_at);
CREATE INDEX idx_events_sync_status  ON public.events(sync_status) WHERE sync_status != 'synced';
CREATE INDEX idx_events_google_id    ON public.events(google_event_id) WHERE google_event_id IS NOT NULL;

-- Índice GiST para detecção de conflitos (tstzrange overlap query)
CREATE INDEX idx_events_date_range ON public.events
  USING GIST (tstzrange(start_at, end_at, '[)'));

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rules ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0003: google sync
-- ============================================================

CREATE TABLE public.google_calendar_accounts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id          UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  google_email       TEXT        NOT NULL,
  calendar_id        TEXT        NOT NULL,
  access_token       TEXT        NOT NULL,
  refresh_token      TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  webhook_channel_id TEXT,
  webhook_expiry     TIMESTAMPTZ,
  is_primary         BOOLEAN     NOT NULL DEFAULT TRUE,
  sync_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at     TIMESTAMPTZ,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(member_id, google_email)
);

CREATE INDEX idx_gca_member_id ON public.google_calendar_accounts(member_id);

CREATE TABLE public.event_sync_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id        UUID        NOT NULL REFERENCES public.members(id),
  operation        TEXT        NOT NULL CHECK (operation IN ('create', 'update', 'delete', 'inbound')),
  direction        TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  source           TEXT        NOT NULL CHECK (source IN ('supabase', 'google', 'n8n')),
  status           TEXT        NOT NULL CHECK (status IN ('success', 'failed', 'pending', 'retry')),
  attempt_count    INTEGER     NOT NULL DEFAULT 1,
  n8n_execution_id TEXT,
  google_event_id  TEXT,
  payload          JSONB,
  response         JSONB,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_esl_event_id ON public.event_sync_log(event_id);
CREATE INDEX idx_esl_status   ON public.event_sync_log(status) WHERE status IN ('failed', 'pending');
CREATE INDEX idx_esl_created  ON public.event_sync_log(created_at DESC);

CREATE TRIGGER gca_updated_at
  BEFORE UPDATE ON public.google_calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.google_calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_sync_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0004: conflicts
-- ============================================================

CREATE TABLE public.conflicts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  event_id_a    UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_id_b    UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  overlap_start TIMESTAMPTZ NOT NULL,
  overlap_end   TIMESTAMPTZ NOT NULL,
  resolved      BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID        REFERENCES public.members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_self_conflict CHECK (event_id_a != event_id_b),
  CONSTRAINT ordered_event_ids CHECK (event_id_a < event_id_b),
  UNIQUE (event_id_a, event_id_b)
);

CREATE INDEX idx_conflicts_member   ON public.conflicts(member_id) WHERE resolved = FALSE;
CREATE INDEX idx_conflicts_event_a  ON public.conflicts(event_id_a);
CREATE INDEX idx_conflicts_event_b  ON public.conflicts(event_id_b);

ALTER TABLE public.conflicts ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0005: audit logs
-- ============================================================

CREATE TABLE public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      UUID        NOT NULL REFERENCES public.members(id),
  actor_role    TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  resource_type TEXT        NOT NULL,
  resource_id   UUID,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor    ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created  ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_action   ON public.audit_logs(action);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0006: notifications + app_settings
-- ============================================================

CREATE TABLE public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN (
               'event_created', 'event_updated', 'event_deleted',
               'conflict_detected', 'sync_failed', 'reminder', 'google_sync_complete'
             )),
  title      TEXT        NOT NULL,
  body       TEXT,
  event_id   UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_member_unread ON public.notifications(member_id, created_at DESC)
  WHERE read = FALSE;
CREATE INDEX idx_notif_member_all    ON public.notifications(member_id, created_at DESC);

CREATE TABLE public.app_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value, description) VALUES
  ('default_timezone',     '"America/Sao_Paulo"',                                    'Fuso horário padrão'),
  ('working_hours',        '{"start": "08:00", "end": "18:00"}',                     'Horário de trabalho'),
  ('reminder_defaults',    '{"minutes_before": [15, 60]}',                           'Lembretes padrão'),
  ('n8n_base_url',         '"https://seu-n8n.com"',                                  'URL base do N8N'),
  ('sync_retry_limit',     '5',                                                       'Máximo de tentativas de sync'),
  ('conflict_alerts',      '{"slack_enabled": false, "email_enabled": false}',        'Canais de alerta');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- MIGRATION 0007: RLS policies
-- ============================================================

-- Funções helper no schema public (auth schema é restrito no SQL Editor)
CREATE OR REPLACE FUNCTION public.eqr_get_member_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.eqr_is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = TRUE
  );
$$;

-- members
CREATE POLICY "members_select_own_or_admin"
  ON public.members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.eqr_is_admin());

CREATE POLICY "members_update_admin_only"
  ON public.members FOR UPDATE TO authenticated
  USING (public.eqr_is_admin()) WITH CHECK (public.eqr_is_admin());

-- events
CREATE POLICY "events_select_own_or_admin"
  ON public.events FOR SELECT TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "events_insert_admin_only"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "events_update_admin_only"
  ON public.events FOR UPDATE TO authenticated
  USING (public.eqr_is_admin()) WITH CHECK (public.eqr_is_admin());

CREATE POLICY "events_delete_admin_only"
  ON public.events FOR DELETE TO authenticated
  USING (public.eqr_is_admin());

-- recurrence_rules
CREATE POLICY "recurrence_select_authenticated"
  ON public.recurrence_rules FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "recurrence_insert_admin_only"
  ON public.recurrence_rules FOR INSERT TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "recurrence_update_admin_only"
  ON public.recurrence_rules FOR UPDATE TO authenticated
  USING (public.eqr_is_admin());

-- google_calendar_accounts
CREATE POLICY "gca_select_own_or_admin"
  ON public.google_calendar_accounts FOR SELECT TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "gca_insert_admin_only"
  ON public.google_calendar_accounts FOR INSERT TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "gca_update_admin_only"
  ON public.google_calendar_accounts FOR UPDATE TO authenticated
  USING (public.eqr_is_admin());

CREATE POLICY "gca_delete_admin_only"
  ON public.google_calendar_accounts FOR DELETE TO authenticated
  USING (public.eqr_is_admin());

-- conflicts
CREATE POLICY "conflicts_select_own_or_admin"
  ON public.conflicts FOR SELECT TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "conflicts_update_admin_only"
  ON public.conflicts FOR UPDATE TO authenticated
  USING (public.eqr_is_admin());

-- event_sync_log
CREATE POLICY "esl_select_admin_only"
  ON public.event_sync_log FOR SELECT TO authenticated
  USING (public.eqr_is_admin());

-- audit_logs (imutável)
CREATE POLICY "audit_select_admin_only"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.eqr_is_admin());

CREATE POLICY "audit_insert_authenticated"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = public.eqr_get_member_id() OR public.eqr_is_admin());

-- notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (member_id = public.eqr_get_member_id());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (member_id = public.eqr_get_member_id());

-- app_settings
CREATE POLICY "app_settings_select_authenticated"
  ON public.app_settings FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "app_settings_update_admin_only"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.eqr_is_admin());


-- ============================================================
-- MIGRATION 0008: realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conflicts;

COMMENT ON TABLE public.events IS 'Eventos EQR. Realtime + Database Webhook → N8N.';
COMMENT ON TABLE public.notifications IS 'Notificações por membro. Realtime habilitado.';
COMMENT ON TABLE public.conflicts IS 'Conflitos detectados pelo conflict-detector edge function.';


-- ============================================================
-- SEED: 5 membros com UUIDs reais dos auth.users criados via Admin API
-- ============================================================

INSERT INTO public.members (id, user_id, name, slug, color, color_hex, role) VALUES
  ('b1000000-0000-0000-0000-000000000001', '707b07b0-ab20-443e-aecd-ad69edd10fc0', 'Admin EQR', 'admin',    'gray',   '#6B7280', 'admin'),
  ('b2000000-0000-0000-0000-000000000002', 'c5cd42ee-afe1-4074-bf03-60c73c3cb400', 'Aluisio',   'aluisio',  'blue',   '#3B82F6', 'member'),
  ('b3000000-0000-0000-0000-000000000003', '7908ea4e-42ae-423e-8123-57d910a0e57f', 'Henrique',  'henrique', 'green',  '#22C55E', 'member'),
  ('b4000000-0000-0000-0000-000000000004', '2fe96970-4c72-4f50-ad3c-ddafc28bd0d1', 'Kadu',      'kadu',     'purple', '#A855F7', 'member'),
  ('b5000000-0000-0000-0000-000000000005', 'f356a11c-72ca-484f-ae58-49fb7cfa8105', 'Wesley',    'wesley',   'orange', '#F97316', 'member')
ON CONFLICT (slug) DO NOTHING;

-- Eventos de exemplo
INSERT INTO public.events (member_id, created_by, title, description, start_at, end_at, sync_status) VALUES
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Reunião de Kickoff',       'Alinhamento inicial',          NOW() + INTERVAL '1 day 9 hours',  NOW() + INTERVAL '1 day 10 hours',  'local_only'),
  ('b3000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Sprint Review',            'Revisão da sprint',            NOW() + INTERVAL '2 days 14 hours', NOW() + INTERVAL '2 days 15 hours', 'local_only'),
  ('b4000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', '1:1 com o CEO',            NULL,                           NOW() + INTERVAL '3 days 10 hours', NOW() + INTERVAL '3 days 10 hours 30 minutes', 'local_only'),
  ('b5000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Apresentação de Resultados','Apresentação mensal',         NOW() + INTERVAL '5 days 15 hours', NOW() + INTERVAL '5 days 17 hours', 'local_only')
ON CONFLICT DO NOTHING;
