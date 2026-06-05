-- Migration: 0003_init_google_sync
-- Contas Google Calendar e log de sincronização

CREATE TABLE public.google_calendar_accounts (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id          UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  google_email       TEXT        NOT NULL,
  calendar_id        TEXT        NOT NULL,
  -- Tokens armazenados encriptados via pgp_sym_encrypt
  access_token       TEXT        NOT NULL,
  refresh_token      TEXT        NOT NULL,
  token_expires_at   TIMESTAMPTZ NOT NULL,
  webhook_channel_id TEXT,
  webhook_expiry     TIMESTAMPTZ,
  is_primary         BOOLEAN     NOT NULL DEFAULT TRUE,
  sync_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at     TIMESTAMPTZ,
  -- Armazena syncToken incremental do Google
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
