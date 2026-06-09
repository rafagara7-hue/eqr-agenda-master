/**
 * Testa o SMTP salvo enviando um email pro próprio admin.
 *
 * Em caso de sucesso:
 *   - grava `verified_at = now()` na config
 *   - limpa `last_test_error`
 *   - daí em diante, getEmailTransport passa a usar SMTP em vez de Resend
 *
 * Em caso de falha:
 *   - grava `last_test_error` com mensagem do server
 *   - NÃO marca verified_at — sistema continua usando Resend
 *
 * O destino é sempre `user.email` (admin logado) — não tem como mandar pra
 * outros emails via esse endpoint, evita ser usado como spam relay.
 */

import { NextResponse } from 'next/server';
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from '@/lib/supabase/server';
import { sendViaSmtp, verifySmtpConnection, type SmtpConfig } from '@/lib/email/smtpTransport';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: rawMe } = await supabase
    .from('members')
    .select('role, name')
    .eq('user_id', user.id)
    .single();
  const me = rawMe as { role: string; name: string } | null;
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!user.email) {
    return NextResponse.json(
      { error: 'Seu usuário não tem email cadastrado — não posso enviar o teste pra você mesmo' },
      { status: 400 }
    );
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data } = await serviceDb
    .from('admin_email_smtp_settings')
    .select(
      'smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password_encrypted, from_address, from_name'
    )
    .eq('id', SINGLETON_ID)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      { error: 'SMTP não configurado. Preencha o formulário primeiro.' },
      { status: 400 }
    );
  }

  const row = data as {
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    smtp_username: string;
    smtp_password_encrypted: string;
    from_address: string;
    from_name: string;
  };

  const config: SmtpConfig = {
    host: row.smtp_host,
    port: row.smtp_port,
    secure: row.smtp_secure,
    username: row.smtp_username,
    passwordEncrypted: row.smtp_password_encrypted,
    fromAddress: row.from_address,
    fromName: row.from_name,
  };

  // 1. Verifica conexão + auth (sem enviar)
  const verify = await verifySmtpConnection(config);
  if (!verify.ok) {
    await serviceDb
      .from('admin_email_smtp_settings')
      .update({ verified_at: null, last_test_error: verify.error ?? null })
      .eq('id', SINGLETON_ID);
    return NextResponse.json(
      {
        ok: false,
        stage: 'verify',
        error: verify.error ?? 'Verificação SMTP falhou',
      },
      { status: 400 }
    );
  }

  // 2. Envia email de teste pro próprio admin
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const send = await sendViaSmtp(config, {
    to: user.email,
    toName: me.name,
    subject: '[EQR Agenda] Teste de SMTP — sucesso',
    html: `
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0D1B2A; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #0D1B2A; margin-bottom: 8px;">Conexão SMTP funcionando</h2>
  <p>Este email foi enviado pelo <strong>EQR Agenda</strong> usando suas credenciais SMTP:</p>
  <table style="margin: 16px 0; padding: 16px; background: #F4ECD0; border-radius: 8px; border-left: 4px solid #D4AF37; width: 100%;">
    <tr><td style="color: #555; padding-bottom: 4px;"><strong>Servidor:</strong> ${config.host}:${config.port}</td></tr>
    <tr><td style="color: #555; padding-bottom: 4px;"><strong>Usuário:</strong> ${config.username}</td></tr>
    <tr><td style="color: #555;"><strong>Remetente:</strong> ${config.fromName} &lt;${config.fromAddress}&gt;</td></tr>
  </table>
  <p>Daqui pra frente, todos os convites de reunião serão enviados desse endereço.</p>
  <hr style="border: 0; border-top: 1px solid #ccc; margin: 24px 0;">
  <p style="color: #888; font-size: 12px;">Enviado em ${now} · EQR Agenda Master</p>
</body></html>
    `.trim(),
    text: [
      'Conexão SMTP funcionando!',
      '',
      `Servidor: ${config.host}:${config.port}`,
      `Usuário: ${config.username}`,
      `Remetente: ${config.fromName} <${config.fromAddress}>`,
      '',
      'Daqui pra frente, convites de reunião serão enviados desse endereço.',
      '',
      `Enviado em ${now}`,
      '— EQR Agenda Master',
    ].join('\n'),
    // teste sem .ics
  });

  if (!send.ok) {
    await serviceDb
      .from('admin_email_smtp_settings')
      .update({ verified_at: null, last_test_error: send.error })
      .eq('id', SINGLETON_ID);
    return NextResponse.json(
      { ok: false, stage: 'send', error: send.error },
      { status: 400 }
    );
  }

  // 3. Marca como verificado — agora pode ser usado em produção
  await serviceDb
    .from('admin_email_smtp_settings')
    .update({
      verified_at: new Date().toISOString(),
      last_test_error: null,
    })
    .eq('id', SINGLETON_ID);

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    messageId: send.messageId,
  });
}
