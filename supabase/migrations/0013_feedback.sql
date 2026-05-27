-- Migration: 0013_feedback
--
-- Cria tabela `feedback` para que membros possam reportar erros e sugerir
-- novas funcionalidades. Admin vê todos os feedbacks, membros veem apenas os
-- próprios. Admin pode marcar status e adicionar nota de resposta.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL CHECK (type IN ('error', 'suggestion')),
  title       TEXT         NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT         NOT NULL CHECK (char_length(description) BETWEEN 1 AND 4000),
  status      TEXT         NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
  admin_note  TEXT         NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_member  ON public.feedback(member_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status  ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback(created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- SELECT: admin vê tudo; membro vê apenas o próprio
CREATE POLICY "feedback_select_own_or_admin"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (
    public.eqr_is_admin()
    OR member_id = public.eqr_get_member_id()
  );

-- INSERT: qualquer membro autenticado pode criar feedback próprio
CREATE POLICY "feedback_insert_self"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (member_id = public.eqr_get_member_id());

-- UPDATE: apenas admin (status + admin_note)
CREATE POLICY "feedback_update_admin"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- DELETE: apenas admin
CREATE POLICY "feedback_delete_admin"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (public.eqr_is_admin());

-- Trigger pra manter updated_at em sincronia
CREATE OR REPLACE FUNCTION public.feedback_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_touch_updated_at_trigger ON public.feedback;
CREATE TRIGGER feedback_touch_updated_at_trigger
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.feedback_touch_updated_at();

-- Realtime: admin vê novos feedbacks imediatamente
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
