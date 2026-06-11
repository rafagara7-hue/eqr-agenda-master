/**
 * Envia convite de reunião (.ics).
 *
 * Transporte é selecionado por `getEmailTransport`:
 *   1. SMTP do admin (config em admin_email_smtp_settings com verified_at) → nodemailer
 *   2. Fallback Resend REST API (sandbox onboarding@resend.dev)
 *
 * Estratégia do email:
 *   - HTML legível (resumo + data + organizador) — funciona mesmo se cliente
 *     ignorar o anexo .ics
 *   - Anexo .ics permite clique pra adicionar ao calendar (Apple Mail, Outlook,
 *     Gmail Web etc.)
 *   - Mensagem em PT-BR, tom corporativo neutro
 *
 * Falhas tratadas:
 *   - Sem transporte configurado → erro claro
 *   - SMTP recusa → propaga mensagem
 *   - Resend não-2xx → propaga mensagem
 *   - Timeout 15s
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { generateMeetingIcs, type MeetingInviteIcs } from './generateMeetingIcs';
import { getEmailTransport } from './getEmailTransport';
import { sendViaSmtp } from './smtpTransport';

type ServiceDb = SupabaseClient<Database>;

export type SendInviteResult =
  | { ok: true; id: string; via: 'smtp' | 'resend' }
  | { ok: false; error: string };

export interface SendMeetingInviteOpts {
  /** Email destinatário (sócio, cliente externo, etc). */
  to: string;
  /** Nome amigável do destinatário pra cabeçalho "To". */
  toName?: string | null;
  /** Dados do invite — vira tanto .ics quanto corpo do email. */
  invite: MeetingInviteIcs;
  /** Override do "from" (só Resend; SMTP usa from da config admin). */
  from?: string;
}

const RESEND_API = 'https://api.resend.com/emails';
const FETCH_TIMEOUT_MS = 15_000;

const RESEND_DEFAULT_FROM =
  process.env['EMAIL_FROM'] ?? 'EQR Agenda <onboarding@resend.dev>';

function formatDateTimePtBr(d: Date): string {
  return d.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function htmlBody(invite: MeetingInviteIcs, toName?: string | null): string {
  const when = `${formatDateTimePtBr(invite.startAt)}–${invite.endAt.toLocaleString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }
  )}`;
  const safeTitle = invite.title.replace(/[<>&]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c
  );
  const safeDesc = (invite.description ?? '').replace(/[<>&]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c
  );
  const greeting = toName ? `Olá ${toName.split(' ')[0]},` : 'Olá,';

  // UID tem formato "eventId@host" → extrai só o eventId pro link público
  const eventId = invite.uid.split('@')[0];
  const appHost = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';
  const icsUrl = `https://${appHost}/api/public/events/${eventId}/ics`;
  const declineMailto = `mailto:${invite.organizer.email}?subject=${encodeURIComponent(
    `Recuso: ${invite.title}`
  )}&body=${encodeURIComponent(
    `Olá,\n\nNão poderei participar da reunião "${invite.title}" em ${when}.\n\n`
  )}`;

  return `
<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #0D1B2A; max-width: 600px; margin: 0 auto; padding: 24px; background: #FAFAFA;">
  <p style="font-size: 15px;">${greeting}</p>
  <p style="font-size: 15px;">Você foi convidado(a) para uma reunião:</p>

  <table style="margin: 16px 0; padding: 16px; background: #F4ECD0; border-radius: 8px; border-left: 4px solid #D4AF37; width: 100%;">
    <tr><td style="font-size: 18px; font-weight: 700; padding-bottom: 8px; color: #0D1B2A;">${safeTitle}</td></tr>
    <tr><td style="color: #555; padding-bottom: 4px;"><strong>Quando:</strong> ${when}</td></tr>
    ${invite.location ? `<tr><td style="color: #555; padding-bottom: 4px;"><strong>Onde:</strong> ${invite.location.replace(/[<>&]/g, '')}</td></tr>` : ''}
    <tr><td style="color: #555;"><strong>Organizado por:</strong> ${invite.organizer.name}</td></tr>
  </table>

  ${safeDesc ? `<p style="color: #555; font-size: 14px;">${safeDesc.replace(/\n/g, '<br>')}</p>` : ''}

  <!-- Botões grandes Sim/Não -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px auto; width: 100%;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 0 6px;">
              <a href="${icsUrl}" style="display: inline-block; padding: 14px 28px; background: #16A34A; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; min-width: 120px; text-align: center;">
                ✓ SIM, aceitar
              </a>
            </td>
            <td style="padding: 0 6px;">
              <a href="${declineMailto}" style="display: inline-block; padding: 14px 28px; background: #DC2626; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; min-width: 120px; text-align: center;">
                ✗ NÃO posso
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <p style="text-align: center; color: #888; font-size: 12px; margin: 8px 0 24px;">
    Clicando em <strong style="color: #16A34A;">SIM</strong>, o arquivo de calendar é baixado e seu app abre pra confirmar.<br>
    Clicando em <strong style="color: #DC2626;">NÃO</strong>, um email de recusa é aberto.
  </p>

  ${invite.url ? `<p style="text-align: center;"><a href="${invite.url}" style="color: #D4AF37; font-weight: 600; font-size: 14px;">Ver detalhes na EQR Agenda →</a></p>` : ''}

  <hr style="border: 0; border-top: 1px solid #DDD; margin: 24px 0 16px;">
  <p style="color: #888; font-size: 11px; text-align: center;">
    O arquivo .ics também está anexado a este email — seu app de calendar pode oferecer botões nativos de Aceitar/Recusar.<br>
    EQR Agenda Master · Convite automático.
  </p>
</body></html>
  `.trim();
}

function plainBody(invite: MeetingInviteIcs, toName?: string | null): string {
  const when = `${formatDateTimePtBr(invite.startAt)}–${invite.endAt.toLocaleString(
    'pt-BR',
    { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }
  )}`;
  const greeting = toName ? `Olá ${toName.split(' ')[0]},` : 'Olá,';
  return [
    greeting,
    '',
    'Você foi convidado(a) para uma reunião:',
    '',
    `${invite.title}`,
    `Quando: ${when}`,
    invite.location ? `Onde: ${invite.location}` : null,
    `Organizado por: ${invite.organizer.name}`,
    invite.description ? `\n${invite.description}` : null,
    '',
    'O arquivo de calendar (.ics) está anexado. Abra-o pra aceitar ou recusar.',
    invite.url ? `\nDetalhes: ${invite.url}` : null,
    '',
    '— EQR Agenda Master',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

async function sendViaResend(opts: SendMeetingInviteOpts, icsBase64: string): Promise<SendInviteResult> {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada' };
  }

  const payload = {
    from: opts.from ?? RESEND_DEFAULT_FROM,
    to: opts.toName ? `${opts.toName} <${opts.to}>` : opts.to,
    subject: `Convite: ${opts.invite.title}`,
    html: htmlBody(opts.invite, opts.toName),
    text: plainBody(opts.invite, opts.toName),
    attachments: [
      {
        filename: 'invite.ics',
        content: icsBase64,
        content_type: 'text/calendar; method=REQUEST; charset=UTF-8',
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[sendMeetingInvite/resend] error', {
        status: res.status,
        to: opts.to,
        body: errText,
      });
      return { ok: false, error: `Resend ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id ?? 'unknown', via: 'resend' };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Timeout ao enviar convite'
          : err.message
        : 'Erro desconhecido';
    console.error('[sendMeetingInvite/resend] exception', { to: opts.to, error: msg });
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Decide transporte (SMTP admin vs Resend fallback) e envia.
 *
 * Recebe `serviceDb` pra consultar a config SMTP. Caller deve usar service
 * client (não user client) porque RLS da tabela exige role='admin' e isso
 * pode rodar em contexto de webhook/cron sem sessão.
 */
export async function sendMeetingInvite(
  serviceDb: ServiceDb,
  opts: SendMeetingInviteOpts
): Promise<SendInviteResult> {
  const ics = generateMeetingIcs(opts.invite);
  const icsBase64 = Buffer.from(ics, 'utf8').toString('base64');

  const transport = await getEmailTransport(serviceDb);

  if (transport.kind === 'smtp') {
    const result = await sendViaSmtp(transport.config, {
      to: opts.to,
      toName: opts.toName ?? undefined,
      subject: `Convite: ${opts.invite.title}`,
      html: htmlBody(opts.invite, opts.toName),
      text: plainBody(opts.invite, opts.toName),
      icsBase64,
    });
    if (!result.ok) {
      console.error('[sendMeetingInvite/smtp] failed', { to: opts.to, error: result.error });
      return { ok: false, error: `SMTP: ${result.error}` };
    }
    return { ok: true, id: result.messageId, via: 'smtp' };
  }

  return sendViaResend(opts, icsBase64);
}
