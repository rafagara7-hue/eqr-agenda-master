-- Migration: 0011_fix_event_participants_rls
-- A policy SELECT de event_participants em 0010 usa EXISTS referenciando
-- a própria tabela, o que aciona avaliação recursiva de RLS e quebra com 500.
-- Corrigimos com uma helper SECURITY DEFINER que bypassa RLS internamente.

CREATE OR REPLACE FUNCTION public.eqr_is_in_event(eid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = eid
      AND member_id = public.eqr_get_member_id()
  );
$$;

DROP POLICY IF EXISTS "event_participants_select_own_or_admin" ON public.event_participants;

CREATE POLICY "event_participants_select_own_or_admin"
  ON public.event_participants FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR member_id = public.eqr_get_member_id()
    OR public.eqr_is_in_event(event_id)
  );
