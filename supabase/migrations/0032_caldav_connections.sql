-- Migration: 0032_caldav_connections
-- CalDAV: push em tempo real de events pro Apple Calendar dos sócios.
--
-- Cada sócio (member) tem 1 conexão CalDAV com iCloud:
--   - apple_id_email: email do iCloud
--   - app_password_encrypted: app-specific password (gerado em appleid.apple.com),
--     encriptado AES-256-GCM com chave em env SMTP_ENCRYPT_KEY (reuso)
--   - calendar_url: URL do calendar "default" do user no iCloud (descoberto na conexão)
--   - calendar_name: nome amigável (ex: "Home")
--
-- Quando EQR Agenda cria/edita/deleta event pro sócio, faz push via CalDAV
-- pra esse calendar.

CREATE TABLE IF NOT EXISTS public.caldav_connections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                UUID NOT NULL UNIQUE REFERENCES public.members(id) ON DELETE CASCADE,
  apple_id_email           TEXT NOT NULL,
  app_password_encrypted   TEXT NOT NULL,
  calendar_url             TEXT,
  calendar_name            TEXT,
  verified_at              TIMESTAMPTZ,
  last_sync_at             TIMESTAMPTZ,
  last_error               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caldav_connections IS
  'CalDAV iCloud connection per member. EQR Agenda pushes events to their Apple Calendar.';
COMMENT ON COLUMN public.caldav_connections.app_password_encrypted IS
  'Apple ID app-specific password, encrypted AES-256-GCM with SMTP_ENCRYPT_KEY env.';

-- ============================================================
-- RLS — member manages own; admin manages all
-- ============================================================

ALTER TABLE public.caldav_connections ENABLE ROW LEVEL SECURITY;

-- SELECT: own connection OR admin
DROP POLICY IF EXISTS caldav_select ON public.caldav_connections;
CREATE POLICY caldav_select ON public.caldav_connections
  FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- INSERT: only for own member_id (or admin)
DROP POLICY IF EXISTS caldav_insert ON public.caldav_connections;
CREATE POLICY caldav_insert ON public.caldav_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- UPDATE: own or admin
DROP POLICY IF EXISTS caldav_update ON public.caldav_connections;
CREATE POLICY caldav_update ON public.caldav_connections
  FOR UPDATE TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- DELETE: own or admin
DROP POLICY IF EXISTS caldav_delete ON public.caldav_connections;
CREATE POLICY caldav_delete ON public.caldav_connections
  FOR DELETE TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_caldav_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_caldav_updated_at ON public.caldav_connections;
CREATE TRIGGER trg_caldav_updated_at
  BEFORE UPDATE ON public.caldav_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_caldav_updated_at();

CREATE INDEX IF NOT EXISTS idx_caldav_member_id ON public.caldav_connections(member_id);
CREATE INDEX IF NOT EXISTS idx_caldav_verified ON public.caldav_connections(verified_at) WHERE verified_at IS NOT NULL;
