-- Migration: 0031_admin_email_smtp
-- Conector SMTP do admin pra envio de convites de reunião.
--
-- Função: admin loga, conecta um email @eqr.com.br (host SMTP + credenciais),
-- e a EQR Agenda passa a usar esse SMTP como transporte de .ics em vez do Resend.
--
-- Por que singleton (id fixo):
--   - Só um SMTP "do sistema" por instalação — todos os convites saem do mesmo
--     remetente. Se quisermos por-admin no futuro, basta trocar o PK + index.
--
-- Segurança:
--   - smtp_password_encrypted: AES-256-GCM base64(iv|tag|ct) — encriptado em Node
--     com chave em env SMTP_ENCRYPT_KEY (NÃO armazenamos a chave aqui)
--   - RLS: só member com role='admin' lê/escreve. Service role do servidor
--     bypassa (uso interno em send / test endpoints).

CREATE TABLE IF NOT EXISTS public.admin_email_smtp_settings (
  id                       UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by               UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  smtp_host                TEXT NOT NULL,
  smtp_port                INTEGER NOT NULL CHECK (smtp_port BETWEEN 1 AND 65535),
  smtp_secure              BOOLEAN NOT NULL DEFAULT false, -- false = STARTTLS (587), true = SSL/TLS (465)
  smtp_username            TEXT NOT NULL,
  smtp_password_encrypted  TEXT NOT NULL, -- base64(iv|tag|ciphertext) — AES-256-GCM
  from_address             TEXT NOT NULL,
  from_name                TEXT NOT NULL,
  verified_at              TIMESTAMPTZ, -- preenche quando endpoint /test envia OK
  last_test_error          TEXT,        -- mensagem da última falha de teste (debug)
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_email_smtp_settings IS
  'Configuração SMTP singleton usada pra enviar convites .ics. Substitui Resend quando verified_at IS NOT NULL.';
COMMENT ON COLUMN public.admin_email_smtp_settings.smtp_password_encrypted IS
  'Senha SMTP encriptada AES-256-GCM, formato base64(iv|tag|ct). Chave em env SMTP_ENCRYPT_KEY do server.';
COMMENT ON COLUMN public.admin_email_smtp_settings.verified_at IS
  'Quando endpoint /test enviou OK pela última vez. NULL = não testado ou falhou.';

-- ============================================================
-- RLS — só admin
-- ============================================================

ALTER TABLE public.admin_email_smtp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_email_smtp_select ON public.admin_email_smtp_settings;
CREATE POLICY admin_email_smtp_select ON public.admin_email_smtp_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );

DROP POLICY IF EXISTS admin_email_smtp_insert ON public.admin_email_smtp_settings;
CREATE POLICY admin_email_smtp_insert ON public.admin_email_smtp_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );

DROP POLICY IF EXISTS admin_email_smtp_update ON public.admin_email_smtp_settings;
CREATE POLICY admin_email_smtp_update ON public.admin_email_smtp_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );

DROP POLICY IF EXISTS admin_email_smtp_delete ON public.admin_email_smtp_settings;
CREATE POLICY admin_email_smtp_delete ON public.admin_email_smtp_settings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );

-- ============================================================
-- Touch updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_admin_email_smtp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_email_smtp_updated_at ON public.admin_email_smtp_settings;
CREATE TRIGGER trg_admin_email_smtp_updated_at
  BEFORE UPDATE ON public.admin_email_smtp_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_admin_email_smtp_updated_at();
