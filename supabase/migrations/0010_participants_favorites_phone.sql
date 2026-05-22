-- Migration: 0010_participants_favorites_phone
--
-- ❶ Substitui events.participants UUID[] (criado em 0009) por tabela
--    intermediária `event_participants` com colunas role + can_edit.
-- ❷ Cria tabela `event_favorites` para destacar reuniões por membro.
-- ❸ Adiciona coluna `phone` nullable em `members`.
--
-- Nota de divergência:
-- A missão referencia FK → users, mas este projeto não tem tabela `users`
-- própria (auth.users é da Auth do Supabase). O domínio aqui é `members`,
-- que é o conceito de "sócio" usado em todo o sistema. As FKs vão para
-- members(id).

-- ============================================================
-- ❶ event_participants (substitui events.participants UUID[])
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_participants (
  event_id   UUID        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  member_id  UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'participant'
             CHECK (role IN ('owner', 'participant')),
  can_edit   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event  ON public.event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_member ON public.event_participants(member_id);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

-- Backfill a partir de events.participants[]: owner = member_id principal,
-- participant = todos os demais. can_edit é true para owner.
INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
SELECT
  e.id,
  e.member_id,
  'owner',
  TRUE
FROM public.events e
ON CONFLICT (event_id, member_id) DO NOTHING;

INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
SELECT
  e.id,
  p AS member_id,
  'participant',
  FALSE
FROM public.events e
CROSS JOIN LATERAL UNNEST(COALESCE(e.participants, ARRAY[]::uuid[])) AS p
WHERE p <> e.member_id
ON CONFLICT (event_id, member_id) DO NOTHING;

-- RLS policies em event_participants
CREATE POLICY "event_participants_select_own_or_admin"
  ON public.event_participants FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR member_id = public.eqr_get_member_id()
    OR EXISTS (
      SELECT 1 FROM public.event_participants ep2
      WHERE ep2.event_id = event_participants.event_id
        AND ep2.member_id = public.eqr_get_member_id()
    )
  );

-- INSERT/UPDATE/DELETE em event_participants: apenas via service_role
-- (toda manipulação é feita pelo backend que já valida).

-- ============================================================
-- Atualizar RLS de events para usar a nova tabela
-- ============================================================

DROP POLICY IF EXISTS "events_select_own_or_admin"       ON public.events;
DROP POLICY IF EXISTS "events_insert_member_or_admin"    ON public.events;
DROP POLICY IF EXISTS "events_update_participant_or_admin" ON public.events;
DROP POLICY IF EXISTS "events_delete_creator_or_admin"   ON public.events;

CREATE POLICY "events_select_own_or_admin"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = events.id
        AND ep.member_id = public.eqr_get_member_id()
    )
  );

CREATE POLICY "events_insert_member_or_admin"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.eqr_is_admin()
    OR created_by = public.eqr_get_member_id()
  );

CREATE POLICY "events_update_participant_or_admin"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = events.id
        AND ep.member_id = public.eqr_get_member_id()
        AND (ep.role = 'owner' OR ep.can_edit = TRUE)
    )
  )
  WITH CHECK (
    public.eqr_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.event_id = events.id
        AND ep.member_id = public.eqr_get_member_id()
        AND (ep.role = 'owner' OR ep.can_edit = TRUE)
    )
  );

CREATE POLICY "events_delete_creator_or_admin"
  ON public.events FOR DELETE
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR created_by = public.eqr_get_member_id()
  );

-- Remove coluna legada participants + trigger normalizador (0009)
DROP TRIGGER IF EXISTS events_normalize_participants_trigger ON public.events;
DROP FUNCTION IF EXISTS public.events_normalize_participants();
DROP INDEX  IF EXISTS public.idx_events_participants;
ALTER TABLE public.events DROP COLUMN IF EXISTS participants;

-- Realtime para event_participants (sincronização cross-tab)
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participants;

-- ============================================================
-- ❷ event_favorites (destaque pessoal de reuniões)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_favorites (
  member_id  UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  event_id   UUID        NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_favorites_member ON public.event_favorites(member_id);
CREATE INDEX IF NOT EXISTS idx_event_favorites_event  ON public.event_favorites(event_id);

ALTER TABLE public.event_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_favorites_select_own"
  ON public.event_favorites FOR SELECT
  TO authenticated
  USING (member_id = public.eqr_get_member_id());

CREATE POLICY "event_favorites_insert_own"
  ON public.event_favorites FOR INSERT
  TO authenticated
  WITH CHECK (member_id = public.eqr_get_member_id());

CREATE POLICY "event_favorites_delete_own"
  ON public.event_favorites FOR DELETE
  TO authenticated
  USING (member_id = public.eqr_get_member_id());

ALTER PUBLICATION supabase_realtime ADD TABLE public.event_favorites;

-- ============================================================
-- ❸ phone em members
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS phone TEXT NULL;

COMMENT ON COLUMN public.members.phone IS
  'Telefone do membro, armazenado somente com dígitos (E.164: [país][DDD][número]). Formatação é responsabilidade do frontend.';
