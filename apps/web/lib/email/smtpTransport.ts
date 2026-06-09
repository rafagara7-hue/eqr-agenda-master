/**
 * Wrapper nodemailer pra envio via SMTP arbitrário (meuemail.net.br, Gmail SMTP,
 * O365 Direct Send, etc.).
 *
 * Cria transporter on-demand (sem pool persistente — Vercel functions reciclam).
 * Decripta senha no momento do send pra não manter plaintext na memória.
 *
 * Falhas:
 *   - decrypt falha → erro com mensagem clara
 *   - conexão recusada → erro com host:port
 *   - auth falha → erro do server (geralmente "535 5.7.0 Authentication failed")
 *   - timeout → erro "ETIMEDOUT" ou similar
 */

import nodemailer from 'nodemailer';
import { decrypt } from './cryptoUtil';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEncrypted: string;
  fromAddress: string;
  fromName: string;
}

export interface SmtpSendInput {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
  /** Base64 do conteúdo .ics. Se vazio/undefined, manda email sem anexo. */
  icsBase64?: string;
}

export type SmtpSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function buildTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: decrypt(config.passwordEncrypted),
    },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    // Não logamos credenciais em prod
    logger: false,
  });
}

export async function sendViaSmtp(
  config: SmtpConfig,
  msg: SmtpSendInput
): Promise<SmtpSendResult> {
  let transporter: ReturnType<typeof buildTransporter>;
  try {
    transporter = buildTransporter(config);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao preparar SMTP',
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: msg.toName ? `${msg.toName} <${msg.to}>` : msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.icsBase64
        ? [
            {
              filename: 'invite.ics',
              content: Buffer.from(msg.icsBase64, 'base64'),
              contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
            },
          ]
        : undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro SMTP desconhecido',
    };
  } finally {
    transporter.close();
  }
}

/**
 * Verifica conexão + auth sem enviar mensagem real. Usado pelo endpoint de
 * test antes do envio.
 */
export async function verifySmtpConnection(
  config: SmtpConfig
): Promise<{ ok: boolean; error?: string }> {
  let transporter: ReturnType<typeof buildTransporter>;
  try {
    transporter = buildTransporter(config);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao preparar SMTP',
    };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Verificação SMTP falhou',
    };
  } finally {
    transporter.close();
  }
}
