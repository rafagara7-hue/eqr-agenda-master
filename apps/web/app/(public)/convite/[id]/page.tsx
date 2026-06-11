/**
 * Página pública /convite/[id] — landing page após clicar "Sim" no email.
 *
 * Por que existe:
 *   - Link direto pra .ics download é instável (depende de file association,
 *     browser settings, Outlook Safe Links etc.). Muitos users acabam vendo
 *     uma página em branco ou navegação confusa em vez do download.
 *   - Essa página oferece UX previsível: mostra os dados da reunião e dá
 *     várias formas de adicionar (download, Google Cal, Outlook Web).
 *
 * Segurança:
 *   - Pública (sem auth) — pra funcionar de email
 *   - Só mostra dados não-sensíveis: title, datas, organizer, location
 *   - UUID v4 do event id é unguessable
 */

import { notFound } from 'next/navigation';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { CalendarPlus, Download, ExternalLink, Mail } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** YYYYMMDDTHHMMSSZ */
function utcCompact(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

export default async function ConvitePage({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawEvent } = await serviceDb
    .from('events')
    .select('id, title, description, location, start_at, end_at, member_id, created_by')
    .eq('id', id)
    .single();
  const event = rawEvent as {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_at: string;
    end_at: string;
    member_id: string;
    created_by: string;
  } | null;

  if (!event) notFound();

  const { data: rawCreator } = await serviceDb
    .from('members')
    .select('name')
    .eq('id', event.created_by)
    .single();
  const creator = rawCreator as { name: string } | null;

  const startAt = new Date(event.start_at);
  const endAt = new Date(event.end_at);
  const host = process.env['NEXT_PUBLIC_APP_HOST'] ?? 'eqr-agenda-master.vercel.app';

  // URL direta de download do .ics
  const icsUrl = `https://${host}/api/public/events/${event.id}/ics`;

  // Google Calendar add link
  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utcCompact(startAt)}/${utcCompact(endAt)}`,
  });
  if (event.description) googleParams.set('details', event.description);
  if (event.location) googleParams.set('location', event.location);
  const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

  // Outlook Web add link (Office 365)
  const outlookParams = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: startAt.toISOString(),
    enddt: endAt.toISOString(),
  });
  if (event.description) outlookParams.set('body', event.description);
  if (event.location) outlookParams.set('location', event.location);
  const outlookUrl = `https://outlook.office.com/owa/?${outlookParams.toString()}`;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0D1B2A 0%, #1F3550 100%)',
        color: '#F8FAFC',
        padding: '24px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32, paddingTop: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(212, 175, 55, 0.15)',
              border: '2px solid #D4AF37',
              marginBottom: 16,
            }}
          >
            <CalendarPlus size={32} color="#D4AF37" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>
            Adicionar à sua agenda
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
            EQR Agenda Master
          </p>
        </div>

        {/* Event card */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            borderRadius: 16,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>{event.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#CBD5E1', fontSize: 14 }}>
            <div>
              <strong style={{ color: '#F8FAFC' }}>📅 Quando:</strong> {formatDateTime(startAt)} — {formatTime(endAt)}
            </div>
            {event.location && (
              <div>
                <strong style={{ color: '#F8FAFC' }}>📍 Onde:</strong> {event.location}
              </div>
            )}
            {creator?.name && (
              <div>
                <strong style={{ color: '#F8FAFC' }}>👤 Organizado por:</strong> {creator.name}
              </div>
            )}
            {event.description && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                {event.description}
              </div>
            )}
          </div>
        </div>

        {/* Big main button — download .ics */}
        <a
          href={icsUrl}
          download="reuniao.ics"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '16px 24px',
            background: '#16A34A',
            color: '#FFFFFF',
            textDecoration: 'none',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 16,
            marginBottom: 12,
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
          }}
        >
          <Download size={20} />
          Baixar arquivo .ics — abre no calendar
        </a>
        <p
          style={{
            textAlign: 'center',
            color: '#94A3B8',
            fontSize: 12,
            margin: '0 0 24px',
          }}
        >
          Funciona em Outlook desktop, Apple Calendar e maioria dos apps de calendário
        </p>

        {/* Alternativas */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', margin: '0 0 12px' }}>
            ou adicionar direto no seu app online:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#F8FAFC',
                textDecoration: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <ExternalLink size={16} />
              Google Calendar
            </a>
            <a
              href={outlookUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#F8FAFC',
                textDecoration: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <ExternalLink size={16} />
              Outlook Web (Office 365)
            </a>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: 16,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#64748B', fontSize: 11, margin: 0 }}>
            Não vai conseguir?{' '}
            <a
              href={`mailto:?subject=${encodeURIComponent(`Recuso: ${event.title}`)}`}
              style={{ color: '#94A3B8', textDecoration: 'underline' }}
            >
              <Mail size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Responder por email
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
