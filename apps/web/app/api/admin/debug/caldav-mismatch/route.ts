/**
 * TEMP: Testa se iCloud rejeita PUT quando filename != UID do .ics.
 * Reproduz exatamente o caso da produção (filename = só eventId, UID = eventId@host).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createDAVClient } from 'tsdav';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/email/cryptoUtil';
import { generateMeetingIcs } from '@/lib/email/generateMeetingIcs';

export async function GET(req: NextRequest) {
  const debugToken = process.env['DEBUG_TOKEN'];
  if (req.headers.get('x-debug-token') !== debugToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawConn } = await serviceDb
    .from('caldav_connections')
    .select('apple_id_email, app_password_encrypted, calendar_url')
    .eq('member_id', memberId)
    .maybeSingle();
  if (!rawConn) return NextResponse.json({ error: 'no conn' });

  const conn = rawConn as {
    apple_id_email: string;
    app_password_encrypted: string;
    calendar_url: string | null;
  };

  const password = decrypt(conn.app_password_encrypted);
  const client = await createDAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: { username: conn.apple_id_email, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  const host = 'eqr-agenda-master.vercel.app';
  const eventId = `prod-style-${Date.now()}`;
  const ics = generateMeetingIcs({
    uid: `${eventId}@${host}`, // mesma estrutura da prod
    title: 'EQR Mismatch Test',
    startAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    organizer: { name: 'EQR', email: conn.apple_id_email },
    attendees: [],
    status: 'CONFIRMED',
  });

  const results: Array<Record<string, unknown>> = [];

  // Test 1: filename SEM @host (igual prod)
  try {
    const r = await client.createCalendarObject({
      calendar: { url: conn.calendar_url! },
      filename: `${eventId}.ics`, // mismatch
      iCalString: ics,
    });
    const rr = r as unknown as { status?: number; statusText?: string; ok?: boolean; url?: string };
    results.push({
      test: 'mismatched_filename',
      filename: `${eventId}.ics`,
      ics_uid: `${eventId}@${host}`,
      status: rr.status,
      statusText: rr.statusText,
      ok: rr.ok,
      response_url: rr.url,
    });
  } catch (err) {
    results.push({
      test: 'mismatched_filename',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Test 2: filename COM @host (match)
  const eventId2 = `prod-match-${Date.now()}`;
  const ics2 = generateMeetingIcs({
    uid: `${eventId2}@${host}`,
    title: 'EQR Match Test',
    startAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
    endAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
    organizer: { name: 'EQR', email: conn.apple_id_email },
    attendees: [],
    status: 'CONFIRMED',
  });
  try {
    const r = await client.createCalendarObject({
      calendar: { url: conn.calendar_url! },
      filename: `${eventId2}@${host}.ics`, // match
      iCalString: ics2,
    });
    const rr = r as unknown as { status?: number; statusText?: string; ok?: boolean; url?: string };
    results.push({
      test: 'matched_filename',
      filename: `${eventId2}@${host}.ics`,
      ics_uid: `${eventId2}@${host}`,
      status: rr.status,
      statusText: rr.statusText,
      ok: rr.ok,
      response_url: rr.url,
    });
  } catch (err) {
    results.push({
      test: 'matched_filename',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ results });
}
