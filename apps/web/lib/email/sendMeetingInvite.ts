/**
 * Envia convite de reunião com .ics inline.
 *
 * Arquitetura:
 *   1. Decide transport (SMTP admin > Resend fallback)
 *   2. Quando SMTP: alinha ORGANIZER do .ics com fromAddress (Outlook trust)
 *   3. Gera .ics + HTML + plain text
 *   4. Envia via icalEvent (SMTP) ou attachments[] (Resend)
 *
 * Por que NÃO tem botões custom "Sim/Não" no email body:
 *   - Outlook desktop/web mostra toolbar nativa Accept/Decline quando vê
 *     text/calendar com METHOD=REQUEST. 1 clique nativo > qualquer botão custom.
 *   - Apple Mail mostra banner "Add to Calendar" nativo.
 *   - Botões custom ficam confusos em Outlook (Word renderer não suporta
 *     `display: inline-block` consistente, background-color quebra etc.)
 *
 * Por que ORGANIZER tem que bater com from:
 *   - Outlook valida que sender == organizer pra mostrar UI de invitation
 *   - Se mismatch, Outlook trata como "info only" e suprime botões
 *   - Apple Mail é menos estrito mas também prefere match
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { generateMeetingIcs, type MeetingInviteIcs } from './generateMeetingIcs';
import { getEmailTransport } from './getEmailTransport';
import { sendViaSmtp, type SmtpConfig } from './smtpTransport';

type ServiceDb = SupabaseClient<Database>;

export type SendInviteResult =
  | { ok: true; id: string; via: 'smtp' | 'resend' }
  | { ok: false; error: string };

export interface SendMeetingInviteOpts {
  to: string;
  toName?: string | null;
  invite: MeetingInviteIcs;
  /** Override From (só Resend; SMTP usa from da config admin). */
  from?: string;
}

const RESEND_API = 'https://api.resend.com/emails';
const FETCH_TIMEOUT_MS = 15_000;
const RESEND_DEFAULT_FROM =
  process.env['EMAIL_FROM'] ?? 'EQR Agenda <onboarding@resend.dev>';

function formatDateRange(startAt: Date, endAt: Date): string {
  const day = startAt.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
  const startTime = startAt.toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const endTime = endAt.toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  return `${day}, ${startTime}–${endTime}`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] ?? c
  );
}

/**
 * HTML body com botões bulletproof Sim/Não.
 *
 * Botões usam o padrão clássico que renderiza em qualquer Outlook:
 *   - <table> + <tr> + <td bgcolor="#xxxxxx">
 *   - bgcolor como HTML attribute (não CSS) — Outlook Word renderer respeita
 *   - <a> dentro do td com display:block + line-height
 *   - SEM display: inline-block (Outlook ignora)
 *   - SEM background CSS shorthand (Outlook prefere background-color)
 *
 * Botão SIM → link direto pro endpoint /api/public/events/[id]/ics
 *   - Server responde com Content-Disposition: attachment
 *   - Browser baixa o arquivo .ics
 *   - SO abre no calendar app default
 *
 * Botão NÃO → mailto: com subject/body pré-preenchido pra resposta de recusa
 */
function htmlBody(invite: MeetingInviteIcs, toName?: string | null): string {
  const when = formatDateRange(invite.startAt, invite.endAt);
  const safeTitle = escapeHtml(invite.title);
  const safeDesc = invite.description ? escapeHtml(invite.description) : '';
  const safeLocation = invite.location ? escapeHtml(invite.location) : '';
  const safeOrganizer = escapeHtml(invite.organizer.name);
  const greeting = toName ? `Olá ${escapeHtml(toName.split(' ')[0] ?? '')},` : 'Olá,';

  const eventId = invite.uid.split('@')[0];
  const appHost = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';
  // webcal:// protocolo nativo de calendar do OS:
  //   - Mac/iPhone (sócios): abre Calendar.app direto → prompt "Adicionar?"
  //   - Windows + Outlook como default: abre Outlook → prompt "Add calendar?"
  //   - Sem download visível, sem prompt "abrir com qual app?", smooth UX
  const icsAcceptUrl = `webcal://${appHost}/api/public/events/${eventId}/ics`;
  // Fallback https:// caso webcal:// não esteja registrado no OS (raro)
  const icsHttpsUrl = `https://${appHost}/api/public/events/${eventId}/ics`;
  const declineMailto = `mailto:${invite.organizer.email}?subject=${encodeURIComponent(
    `Recuso: ${invite.title}`
  )}&body=${encodeURIComponent(
    `Olá,\n\nNão poderei participar da reunião "${invite.title}" em ${when}.\n\n`
  )}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#F5F5F5" style="background-color:#F5F5F5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" bgcolor="#FFFFFF" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;overflow:hidden;">
          <tr>
            <td bgcolor="#0D1B2A" style="background-color:#0D1B2A;padding:20px 24px;">
              <p style="margin:0;color:#D4AF37;font-size:14px;font-weight:bold;letter-spacing:1px;">EQR AGENDA</p>
              <p style="margin:4px 0 0;color:#FFFFFF;font-size:11px;">Convite de reunião</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px;color:#0D1B2A;font-size:15px;">${greeting}</p>
              <p style="margin:0 0 16px;color:#555555;font-size:14px;line-height:1.5;">Você foi convidado(a) para uma reunião:</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FAF5E6" style="margin:0 0 20px;border-left:4px solid #D4AF37;background-color:#FAF5E6;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 10px;color:#0D1B2A;font-size:18px;font-weight:bold;">${safeTitle}</p>
                    <p style="margin:0 0 6px;color:#333333;font-size:14px;"><strong style="color:#0D1B2A;">Quando:</strong> ${when}</p>
                    ${safeLocation ? `<p style="margin:0 0 6px;color:#333333;font-size:14px;"><strong style="color:#0D1B2A;">Onde:</strong> ${safeLocation}</p>` : ''}
                    <p style="margin:0;color:#333333;font-size:14px;"><strong style="color:#0D1B2A;">Organizado por:</strong> ${safeOrganizer}</p>
                  </td>
                </tr>
              </table>

              ${safeDesc ? `<p style="margin:0 0 16px;color:#555555;font-size:14px;line-height:1.5;">${safeDesc.replace(/\n/g, '<br>')}</p>` : ''}

              <!-- ============ BOTÕES BULLETPROOF SIM/NÃO ============ -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#16A34A" style="background-color:#16A34A;border-radius:6px;padding:0;">
                          <a href="${icsAcceptUrl}" style="display:block;padding:14px 28px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;line-height:1;">
                            &#10003; SIM, aceitar
                          </a>
                        </td>
                        <td style="width:12px;font-size:0;line-height:0;">&nbsp;</td>
                        <td bgcolor="#DC2626" style="background-color:#DC2626;border-radius:6px;padding:0;">
                          <a href="${declineMailto}" style="display:block;padding:14px 28px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;line-height:1;">
                            &#10007; N&Atilde;O posso
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;text-align:center;color:#888888;font-size:12px;line-height:1.5;">
                <strong style="color:#16A34A;">SIM</strong> abre seu calendar direto pra confirmar a reuni&atilde;o.<br>
                <strong style="color:#DC2626;">N&Atilde;O</strong> abre email de recusa pra responder.
              </p>
              <p style="margin:0 0 16px;text-align:center;color:#AAAAAA;font-size:10px;">
                <a href="${icsHttpsUrl}" style="color:#AAAAAA;text-decoration:underline;">se o SIM n&atilde;o abrir, clique aqui pra baixar o arquivo .ics</a>
              </p>

              ${invite.url ? `<p style="margin:0;font-size:13px;text-align:center;"><a href="${invite.url}" style="color:#D4AF37;font-weight:bold;text-decoration:none;">Ver detalhes na EQR Agenda &rarr;</a></p>` : ''}
            </td>
          </tr>
          <tr>
            <td bgcolor="#F5F5F5" style="background-color:#F5F5F5;padding:14px 24px;border-top:1px solid #E5E5E5;">
              <p style="margin:0;color:#888888;font-size:11px;text-align:center;line-height:1.5;">
                Outlook e Apple Mail tamb&eacute;m podem mostrar bot&otilde;es Aceitar/Recusar nativos no topo.<br>
                EQR Agenda Master &middot; convite autom&aacute;tico
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plainBody(invite: MeetingInviteIcs, toName?: string | null): string {
  const when = formatDateRange(invite.startAt, invite.endAt);
  const greeting = toName ? `Olá ${toName.split(' ')[0]},` : 'Olá,';
  const lines: string[] = [
    greeting,
    '',
    'Você foi convidado(a) para uma reunião:',
    '',
    `Título: ${invite.title}`,
    `Quando: ${when}`,
  ];
  if (invite.location) lines.push(`Onde: ${invite.location}`);
  lines.push(`Organizado por: ${invite.organizer.name}`);
  if (invite.description) {
    lines.push('');
    lines.push(invite.description);
  }
  lines.push('');
  lines.push('Use os botões "Aceitar / Talvez / Recusar" do seu app de email pra adicionar.');
  lines.push('Outlook, Apple Mail e Gmail mostram automaticamente.');
  if (invite.url) {
    lines.push('');
    lines.push(`Detalhes: ${invite.url}`);
  }
  lines.push('');
  lines.push('— EQR Agenda Master');
  return lines.join('\n');
}

/**
 * Quando enviando via SMTP, força ORGANIZER.email = SMTP fromAddress. Isso
 * faz Outlook confiar no convite e mostrar a toolbar nativa. Mantém o name.
 */
function alignOrganizerWithSmtp(invite: MeetingInviteIcs, config: SmtpConfig): MeetingInviteIcs {
  return {
    ...invite,
    organizer: {
      name: invite.organizer.name,
      email: config.fromAddress,
    },
  };
}

async function sendViaResend(
  opts: SendMeetingInviteOpts,
  ics: string
): Promise<SendInviteResult> {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada' };
  }
  const icsBase64 = Buffer.from(ics, 'utf8').toString('base64');
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
        body: errText.slice(0, 300),
      });
      return {
        ok: false,
        error: `Resend ${res.status}: ${errText.slice(0, 200)}`,
      };
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

export async function sendMeetingInvite(
  serviceDb: ServiceDb,
  opts: SendMeetingInviteOpts
): Promise<SendInviteResult> {
  const transport = await getEmailTransport(serviceDb);

  if (transport.kind === 'smtp') {
    const inviteForSmtp = alignOrganizerWithSmtp(opts.invite, transport.config);
    let ics: string;
    try {
      ics = generateMeetingIcs(inviteForSmtp);
    } catch (err) {
      console.error('[sendMeetingInvite/smtp] ics gen failed', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao gerar .ics',
      };
    }
    const result = await sendViaSmtp(transport.config, {
      to: opts.to,
      toName: opts.toName ?? undefined,
      subject: `Convite: ${opts.invite.title}`,
      html: htmlBody(inviteForSmtp, opts.toName),
      text: plainBody(inviteForSmtp, opts.toName),
      icsContent: ics,
      icsMethod: opts.invite.status === 'CANCELLED' ? 'CANCEL' : 'REQUEST',
    });
    if (!result.ok) {
      console.error('[sendMeetingInvite/smtp] failed', {
        to: opts.to,
        error: result.error,
        code: result.code,
      });
      return { ok: false, error: `SMTP: ${result.error}` };
    }
    return { ok: true, id: result.messageId, via: 'smtp' };
  }

  // Resend fallback
  let ics: string;
  try {
    ics = generateMeetingIcs(opts.invite);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao gerar .ics',
    };
  }
  return sendViaResend(opts, ics);
}
