-- Migration: 0012_members_select_all
--
-- Antes: SELECT em members só liberado para o próprio (user_id = auth.uid()) ou admin.
-- Efeito colateral: members não conseguiam montar a lista de outros members para
-- adicionar como participantes em reuniões conjuntas.
--
-- Agora: qualquer authenticated pode SELECT em members (nome, cor, avatar etc.).
-- Edição/criação continua restrita ao admin.

DROP POLICY IF EXISTS "members_select_own_or_admin" ON public.members;

CREATE POLICY "members_select_authenticated"
  ON public.members FOR SELECT
  TO authenticated
  USING (true);
