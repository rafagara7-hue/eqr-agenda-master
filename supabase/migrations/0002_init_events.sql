-- Migration: 0002_init_events
-- Tabela de regras de recorrência e eventos do calendário

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

-- Índices de performance
CREATE INDEX idx_events_member_id    ON public.events(member_id);
CREATE INDEX idx_events_start_at     ON public.events(start_at);
CREATE INDEX idx_events_end_at       ON public.events(end_at);
CREATE INDEX idx_events_sync_status  ON public.events(sync_status) WHERE sync_status != 'synced';
CREATE INDEX idx_events_google_id    ON public.events(google_event_id) WHERE google_event_id IS NOT NULL;

-- Índice GiST para detecção de conflitos eficiente
CREATE INDEX idx_events_date_range ON public.events
  USING GIST (tstzrange(start_at, end_at, '[)'));

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rules ENABLE ROW LEVEL SECURITY;
