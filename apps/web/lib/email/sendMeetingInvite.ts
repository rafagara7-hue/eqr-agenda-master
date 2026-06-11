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
 * HTML body do convite.
 *
 * Estratégia "apertou, entrou" (sócios usam Mac + Apple Mail):
 *   - O .ics vai como text/calendar;method=REQUEST dentro de
 *     multipart/alternative (ver smtpTransport). Apple Mail detecta como
 *     convite e desenha "Aceitar / Talvez / Recusar" NATIVO no topo do email.
 *   - 1 toque em "Aceitar" → evento entra no Apple Calendar na hora, SEM abrir
 *     navegador e SEM baixar arquivo. Esse é o caminho principal.
 *
 * Por que NÃO usamos botão custom grande "SIM" no corpo:
 *   - Um <a href="https://.../ics"> sempre abre o navegador e baixa o arquivo
 *     (Content-Disposition: attachment) — exatamente o atrito que queremos evitar.
 *   - Ele competia visualmente com o banner nativo e roubava o clique.
 *
 * Fallback discreto (links pequenos, pra quem não usa Apple Mail):
 *   - "Adicionar manualmente" → /api/public/events/[id]/ics (baixa o .ics)
 *   - "Não poderei ir" → mailto: de recusa pré-preenchido
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
  // https:// (NÃO webcal://): Outlook desktop strippa links webcal:// como
  // protocolo suspeito — junto com o styling do botão. https:// é universal.
  //
  // Comportamento no clique:
  //   - Mac (Safari/Chrome): auto-abre .ics em Calendar.app → prompt "Add?"
  //     Sem download visível, smooth UX.
  //   - iPhone: idem, abre Calendar app.
  //   - Windows (Edge/Chrome) + Outlook: baixa .ics, OS abre no Outlook
  //     Calendar pra adicionar.
  //   - Webmail (Gmail web): oferece "Add to Google Calendar"
  const icsAcceptUrl = `https://${appHost}/api/public/events/${eventId}/ics`;
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

              <!-- ===== CTA: banner nativo "Aceitar" do Apple Mail ===== -->
              <!-- O .ics vai como text/calendar;method=REQUEST → Apple Mail desenha
                   "Aceitar / Talvez / Recusar" no topo do email. 1 toque = evento no
                   Calendar, sem browser e sem download. Aqui só apontamos pra lá. -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#EAF7EE" style="margin:8px 0 14px;background-color:#EAF7EE;border:1px solid #16A34A;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;text-align:center;">
                    <p style="margin:0 0 6px;color:#15803D;font-size:15px;font-weight:bold;">
                      &#10003; Adicionar no seu Apple Calendar
                    </p>
                    <p style="margin:0;color:#333333;font-size:14px;line-height:1.5;">
                      Toque em <strong style="color:#15803D;">Aceitar</strong> no topo deste email
                      (logo abaixo do remetente). O evento entra na sua agenda na hora &mdash;
                      sem baixar nada, sem abrir o navegador.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;text-align:center;color:#AAAAAA;font-size:11px;line-height:1.6;">
                N&atilde;o aparece o bot&atilde;o Aceitar?
                <a href="${icsAcceptUrl}" style="color:#888888;text-decoration:underline;">Adicionar manualmente</a>
                &nbsp;&middot;&nbsp;
                <a href="${declineMailto}" style="color:#888888;text-decoration:underline;">N&atilde;o poderei ir</a>
              </p>

              ${invite.url ? `<p style="margin:0;font-size:13px;text-align:center;"><a href="${invite.url}" style="color:#D4AF37;font-weight:bold;text-decoration:none;">Ver detalhes na EQR Agenda &rarr;</a></p>` : ''}
            </td>
          </tr>
          <tr>
            <td bgcolor="#F5F5F5" style="background-color:#F5F5F5;padding:14px 24px;border-top:1px solid #E5E5E5;">
              <p style="margin:0;color:#888888;font-size:11px;text-align:center;line-height:1.5;">
                O bot&atilde;o <strong>Aceitar</strong> aparece no topo do email no Apple Mail (Mac e iPhone).<br>
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
  lines.push('Para adicionar no seu Apple Calendar: toque em "Aceitar" no topo deste email.');
  lines.push('O evento entra na hora, sem baixar nada.');
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
