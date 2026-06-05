-- Migration: 0005_init_audit_logs
-- Log de auditoria imutável (sem DELETE RLS)

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
