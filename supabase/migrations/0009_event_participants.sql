-- Migration: 0009_event_participants
-- Permite que um único evento tenha múltiplos membros participantes (reuniões em conjunto).
-- O `member_id` continua existindo como o "membro principal/dono" do evento por
-- compatibilidade com o resto do sistema; `participants` é a lista completa
-- (incluindo o member_id principal). Conflitos passam a olhar `participants`.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS participants UUID[] NOT NULL DEFAULT '{}';

-- Garante que o member_id sempre esteja em participants e que não haja duplicatas
CREATE OR REPLACE FUNCTION public.events_normalize_participants()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.participants IS NULL THEN
    NEW.participants := ARRAY[NEW.member_id];
  ELSIF NOT (NEW.member_id = ANY(NEW.participants)) THEN
    NEW.participants := array_prepend(NEW.member_id, NEW.participants);
  END IF;

  -- Remove duplicatas mantendo ordem (member_id primeiro)
  NEW.participants := ARRAY(
    SELECT DISTINCT unnest(NEW.participants)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_normalize_participants_trigger ON public.events;
CREATE TRIGGER events_normalize_participants_trigger
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_normalize_participants();

-- Backfill: eventos antigos passam a ter o próprio member_id no array
UPDATE public.events
SET participants = ARRAY[member_id]
WHERE participants IS NULL OR cardinality(participants) = 0;

-- Index para queries de "eventos em que sou participante"
CREATE INDEX IF NOT EXISTS idx_events_participants ON public.events USING GIN (participants);

-- ============================================================
-- RLS atualizada: SELECT/UPDATE/DELETE consideram participants
-- ============================================================

DROP POLICY IF EXISTS "events_select_own_or_admin" ON public.events;
CREATE POLICY "events_select_own_or_admin"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR public.eqr_get_member_id() = ANY(participants)
  );

-- Membros agora podem INSERT seus próprios eventos (e marcar outros como participantes).
-- WITH CHECK garante que o criador esteja em participants.
DROP POLICY IF EXISTS "events_insert_admin_only" ON public.events;
CREATE POLICY "events_insert_member_or_admin"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.eqr_is_admin()
    OR (
      public.eqr_get_member_id() = ANY(participants)
      AND created_by = public.eqr_get_member_id()
    )
  );

-- UPDATE: admin sempre; participantes podem se for evento em que estão.
-- (Em prática o backend roda como service_role e ignora RLS; isso é defesa em profundidade.)
DROP POLICY IF EXISTS "events_update_admin_only" ON public.events;
CREATE POLICY "events_update_participant_or_admin"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR public.eqr_get_member_id() = ANY(participants)
  )
  WITH CHECK (
    public.eqr_is_admin()
    OR public.eqr_get_member_id() = ANY(participants)
  );

-- DELETE: admin sempre; quem criou também.
DROP POLICY IF EXISTS "events_delete_admin_only" ON public.events;
CREATE POLICY "events_delete_creator_or_admin"
  ON public.events FOR DELETE
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR created_by = public.eqr_get_member_id()
  );
