-- Migration: 0014_microsoft_calendar_migration
--
-- Migração da integração Google Calendar para Microsoft Outlook Calendar (Graph API),
-- generalizando o schema pra suportar múltiplos providers no futuro.
--
-- Estratégia:
--  1. Criar nova tabela calendar_provider_accounts com coluna provider TEXT
--  2. Copiar dados de google_calendar_accounts (se houver) com provider='google'
--  3. Renomear events.google_event_id → events.external_event_id, + external_provider
--  4. Renomear members.google_linked → members.calendar_linked
--  5. Atualizar event_sync_log (renomear coluna, adicionar 'microsoft' ao CHECK source)
--  6. Atualizar notifications type (replace 'google_sync_complete' → 'calendar_sync_complete')
--  7. Dropar tabela antiga + recriar policies RLS

-- ============================================================
-- 1. Nova tabela generalizada de contas de calendário
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendar_provider_accounts (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  provider            TEXT         NOT NULL CHECK (provider IN ('google', 'microsoft')),
  provider_email      TEXT         NOT NULL,
  calendar_id         TEXT         NOT NULL,
  access_token        TEXT         NOT NULL,
  refresh_token       TEXT         NOT NULL,
  token_expires_at    TIMESTAMPTZ  NOT NULL,
  subscription_id     TEXT         NULL,
  subscription_expiry TIMESTAMPTZ  NULL,
  sync_enabled        BOOLEAN      NOT NULL DEFAULT TRUE,
  is_primary          BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, provider, provider_email)
);

CREATE INDEX IF NOT EXISTS idx_cpa_member_id ON public.calendar_provider_accounts(member_id);
CREATE INDEX IF NOT EXISTS idx_cpa_provider  ON public.calendar_provider_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_cpa_subscription ON public.calendar_provider_accounts(subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Trigger touch updated_at
CREATE OR REPLACE FUNCTION public.cpa_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cpa_updated_at_trigger ON public.calendar_provider_accounts;
CREATE TRIGGER cpa_updated_at_trigger
  BEFORE UPDATE ON public.calendar_provider_accounts
  FOR EACH ROW EXECUTE FUNCTION public.cpa_touch_updated_at();

-- ============================================================
-- 2. Backfill: copiar contas Google existentes pra nova tabela
-- ============================================================

INSERT INTO public.calendar_provider_accounts (
  member_id, provider, provider_email, calendar_id,
  access_token, refresh_token, token_expires_at,
  subscription_id, subscription_expiry,
  sync_enabled, is_primary, metadata, created_at, updated_at
)
SELECT
  member_id, 'google', google_email, calendar_id,
  access_token, refresh_token, token_expires_at,
  webhook_channel_id, webhook_expiry,
  sync_enabled, is_primary, COALESCE(metadata, '{}'::jsonb), created_at, updated_at
FROM public.google_calendar_accounts
ON CONFLICT (member_id, provider, provider_email) DO NOTHING;

-- ============================================================
-- 3. events: renomear google_event_id → external_event_id + external_provider
-- ============================================================

ALTER TABLE public.events RENAME COLUMN google_event_id TO external_event_id;

DROP INDEX IF EXISTS public.idx_events_google_id;
CREATE INDEX IF NOT EXISTS idx_events_external_id ON public.events(external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS external_provider TEXT NULL
    CHECK (external_provider IN ('google', 'microsoft'));

-- Marca eventos já sincronizados como Google (historicidade)
UPDATE public.events SET external_provider = 'google'
WHERE external_event_id IS NOT NULL AND external_provider IS NULL;

-- ============================================================
-- 4. members: renomear google_linked → calendar_linked
-- ============================================================

ALTER TABLE public.members RENAME COLUMN google_linked TO calendar_linked;

-- ============================================================
-- 5. event_sync_log: renomear coluna + atualizar CHECK source
-- ============================================================

ALTER TABLE public.event_sync_log RENAME COLUMN google_event_id TO external_event_id;

ALTER TABLE public.event_sync_log DROP CONSTRAINT IF EXISTS event_sync_log_source_check;
ALTER TABLE public.event_sync_log
  ADD CONSTRAINT event_sync_log_source_check
  CHECK (source IN ('supabase', 'google', 'microsoft', 'n8n'));

-- ============================================================
-- 6. notifications: substituir 'google_sync_complete' por 'calendar_sync_complete'
-- ============================================================

UPDATE public.notifications
SET type = 'calendar_sync_complete'
WHERE type = 'google_sync_complete';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'event_created', 'event_updated', 'event_deleted',
    'conflict_detected', 'sync_failed', 'reminder',
    'calendar_sync_complete',
    'feedback_new', 'feedback_update'
  ));

-- ============================================================
-- 7. Dropar tabela antiga google_calendar_accounts (após backfill)
-- ============================================================

-- Drop policies antigas explicitamente (algumas migrations não usam CASCADE)
DROP POLICY IF EXISTS "gca_select_own_or_admin" ON public.google_calendar_accounts;
DROP POLICY IF EXISTS "gca_insert_admin_only"  ON public.google_calendar_accounts;
DROP POLICY IF EXISTS "gca_update_admin_only"  ON public.google_calendar_accounts;
DROP POLICY IF EXISTS "gca_delete_admin_only"  ON public.google_calendar_accounts;

DROP TABLE IF EXISTS public.google_calendar_accounts CASCADE;

-- ============================================================
-- 8. RLS policies na nova tabela
-- ============================================================

ALTER TABLE public.calendar_provider_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpa_select_own_or_admin"
  ON public.calendar_provider_accounts FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR member_id = public.eqr_get_member_id()
  );

-- INSERT/UPDATE/DELETE via service_role apenas (admin endpoints fazem auth check)

-- ============================================================
-- 9. Realtime (opcional — não estava na original mas adiciona pra sincronia cross-tab)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_provider_accounts;

-- ============================================================
-- Comentários documentação
-- ============================================================

COMMENT ON TABLE public.calendar_provider_accounts IS
  'Contas de calendário (Google, Microsoft) vinculadas via OAuth. Generalizada para suportar múltiplos providers.';

COMMENT ON COLUMN public.calendar_provider_accounts.subscription_id IS
  'ID da subscription/channel pra push notifications. Google: webhook channel ID. Microsoft: subscription ID.';

COMMENT ON COLUMN public.calendar_provider_accounts.metadata IS
  'JSONB com syncToken (Google) ou deltaToken (Microsoft) para sync incremental + outros dados específicos do provider.';

COMMENT ON COLUMN public.events.external_event_id IS
  'ID do evento no calendário externo (Google ou Microsoft). Referenciar external_provider pra saber qual.';

COMMENT ON COLUMN public.events.external_provider IS
  'Provider do calendário externo onde este evento foi sincronizado: google ou microsoft.';
