-- Migration: 0004_init_conflicts
-- Detecção e rastreamento de conflitos de agenda

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
