/**
 * Wrapper nodemailer pra envio de email (com ou sem .ics inline).
 *
 * Decisão chave: usar `icalEvent` em vez de `attachments[]` quando enviando
 * convite. Razões:
 *   - `icalEvent` constrói a estrutura MIME correta pra meeting invites:
 *     multipart/mixed → multipart/alternative → [text/plain, text/html, text/calendar]
 *   - Outlook desktop reconhece text/calendar com METHOD=REQUEST e mostra
 *     toolbar nativa "Accept/Tentative/Decline" automaticamente
 *   - Apple Mail mesmo: banner "Add to Calendar"
 *   - Gmail: oferece "Add to Google Calendar"
 *
 * Quando icsContent é passado, NÃO usar attachments[] pro .ics — duplicaria.
 *
 * Falhas tratadas:
 *   - decrypt falha → erro descritivo
 *   - conexão recusada → erro com host:port
 *   - auth falha (535) → erro com sugestão
 *   - timeout → erro "ETIMEDOUT"
 */

import nodemailer from 'nodemailer';
import { decrypt } from './cryptoUtil';

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = SSL/TLS direto (geralmente porta 465); false = STARTTLS (587) */
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
  /**
   * Conteúdo .ics (string, NÃO base64). Quando presente, é enviado como
   * `icalEvent` pra que o cliente de email reconheça como meeting invite.
   * Não duplicar como anexo — o icalEvent já fica como anexo + inline.
   */
  icsContent?: string;
  /** METHOD do .ics (REQUEST, CANCEL, REPLY). Default: REQUEST */
  icsMethod?: 'REQUEST' | 'CANCEL' | 'REPLY' | 'PUBLISH';
  /** Anexos genéricos (não usar pro .ics; usa icsContent). */
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export type SmtpSendResult =
  | { ok: true; messageId: string; response: string }
  | { ok: false; error: string; code?: string };

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
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });
}

/**
 * Mapeia erros de nodemailer/SMTP pra mensagens legíveis.
 */
function describeSmtpError(err: unknown): { message: string; code?: string } {
  if (!(err instanceof Error)) {
    return { message: typeof err === 'string' ? err : 'Erro SMTP desconhecido' };
  }
  const code = (err as { code?: string }).code;
  const responseCode = (err as { responseCode?: number }).responseCode;
  const msg = err.message ?? 'Erro SMTP';

  if (code === 'ETIMEDOUT') {
    return { message: `Timeout conectando ao servidor SMTP — host/porta inacessível`, code };
  }
  if (code === 'ECONNREFUSED') {
    return { message: `Conexão recusada pelo servidor SMTP — host/porta inválidos`, code };
  }
  if (code === 'EAUTH' || responseCode === 535) {
    return { message: `Falha de autenticação SMTP (535) — usuário/senha incorretos`, code };
  }
  if (responseCode === 550) {
    return { message: `Envio recusado (550) — remetente sem permissão`, code: '550' };
  }
  return { message: msg, code };
}

export async function sendViaSmtp(
  config: SmtpConfig,
  msg: SmtpSendInput
): Promise<SmtpSendResult> {
  let transporter: ReturnType<typeof buildTransporter>;
  try {
    transporter = buildTransporter(config);
  } catch (err) {
    const { message } = describeSmtpError(err);
    return { ok: false, error: `Setup SMTP: ${message}` };
  }

  try {
    const mailOpts: Parameters<typeof transporter.sendMail>[0] = {
      from: { name: config.fromName, address: config.fromAddress },
      to: msg.toName ? { name: msg.toName, address: msg.to } : msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    };

    if (msg.icsContent) {
      mailOpts.icalEvent = {
        method: msg.icsMethod ?? 'REQUEST',
        content: msg.icsContent,
        filename: 'invite.ics',
      };
    }

    if (msg.attachments && msg.attachments.length > 0) {
      mailOpts.attachments = msg.attachments;
    }

    const info = await transporter.sendMail(mailOpts);
    return {
      ok: true,
      messageId: info.messageId,
      response: info.response ?? '',
    };
  } catch (err) {
    const { message, code } = describeSmtpError(err);
    return { ok: false, error: message, code };
  } finally {
    transporter.close();
  }
}

/**
 * Verifica conexão + auth sem enviar mensagem. Usado pelo endpoint de teste.
 */
export async function verifySmtpConnection(
  config: SmtpConfig
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  let transporter: ReturnType<typeof buildTransporter>;
  try {
    transporter = buildTransporter(config);
  } catch (err) {
    const { message } = describeSmtpError(err);
    return { ok: false, error: `Setup SMTP: ${message}` };
  }
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const { message, code } = describeSmtpError(err);
    return { ok: false, error: message, code };
  } finally {
    transporter.close();
  }
}
