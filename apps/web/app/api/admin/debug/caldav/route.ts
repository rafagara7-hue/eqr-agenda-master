/**
 * ENDPOINT DE DIAGNÓSTICO TEMPORÁRIO — CalDAV push step-by-step.
 *
 * Uso:
 *   GET /api/admin/debug/caldav?memberId=<uuid>
 *   Header: x-debug-token: <DEBUG_TOKEN env>
 *
 * Mostra cada step do push (decrypt, createDAVClient, fetchCalendars,
 * createCalendarObject) com status real do response do iCloud.
 *
 * REMOVER quando o diagnóstico tiver sido feito.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createDAVClient } from 'tsdav';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/email/cryptoUtil';
import { generateMeetingIcs } from '@/lib/email/generateMeetingIcs';

export async function GET(req: NextRequest) {
  const debugToken = process.env['DEBUG_TOKEN'];
  const passedToken = req.headers.get('x-debug-token');
  if (!debugToken || passedToken !== debugToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json({ error: 'memberId required as query param' }, { status: 400 });
  }

  const diagnostic: {
    member_id: string;
    steps: Array<Record<string, unknown>>;
  } = { member_id: memberId, steps: [] };

  const serviceDb = await getSupabaseServiceClient();
  const { data: rawConn } = await serviceDb
    .from('caldav_connections')
    .select('id, apple_id_email, app_password_encrypted, calendar_url, calendar_name, verified_at, last_sync_at, last_error')
    .eq('member_id', memberId)
    .maybeSingle();

  if (!rawConn) {
    diagnostic.steps.push({ step: 'fetch_connection', ok: false, error: 'No caldav connection for member' });
    return NextResponse.json(diagnostic, { status: 200 });
  }

  const conn = rawConn as {
    id: string;
    apple_id_email: string;
    app_password_encrypted: string;
    calendar_url: string | null;
    calendar_name: string | null;
    verified_at: string | null;
    last_sync_at: string | null;
    last_error: string | null;
  };

  diagnostic.steps.push({
    step: 'fetch_connection',
    ok: true,
    apple_id_email: conn.apple_id_email,
    calendar_url: conn.calendar_url,
    calendar_name: conn.calendar_name,
    verified_at: conn.verified_at,
    last_sync_at: conn.last_sync_at,
    last_error: conn.last_error,
  });

  // Step 1: Decrypt
  let appPassword: string;
  try {
    appPassword = decrypt(conn.app_password_encrypted);
    diagnostic.steps.push({
      step: 'decrypt_password',
      ok: true,
      passwordLength: appPassword.length,
      passwordMasked: appPassword.length >= 4 ? `${appPassword.substring(0, 4)}…(${appPassword.length} chars)` : '?',
    });
  } catch (err) {
    diagnostic.steps.push({
      step: 'decrypt_password',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(diagnostic, { status: 200 });
  }

  // Step 2: createDAVClient
  let client;
  try {
    client = await createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: conn.apple_id_email, password: appPassword },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    diagnostic.steps.push({ step: 'createDAVClient', ok: true });
  } catch (err) {
    diagnostic.steps.push({
      step: 'createDAVClient',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.substring(0, 1000) : undefined,
    });
    return NextResponse.json(diagnostic, { status: 200 });
  }

  // Step 3: fetchCalendars
  let calendars;
  try {
    calendars = await client.fetchCalendars();
    diagnostic.steps.push({
      step: 'fetchCalendars',
      ok: true,
      count: calendars.length,
      calendars: calendars.map((c) => ({
        url: c.url,
        displayName: typeof c.displayName === 'string' ? c.displayName : '(no name)',
        components: c.components,
      })),
    });
  } catch (err) {
    diagnostic.steps.push({
      step: 'fetchCalendars',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(diagnostic, { status: 200 });
  }

  if (!conn.calendar_url) {
    diagnostic.steps.push({ step: 'check_calendar_url', ok: false, error: 'No calendar_url in connection row' });
    return NextResponse.json(diagnostic, { status: 200 });
  }

  // Step 4: Generate test .ics
  const testUid = `eqr-debug-${Date.now()}@eqr-agenda-master.vercel.app`;
  const startAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias no futuro
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const ics = generateMeetingIcs({
    uid: testUid,
    title: 'EQR Debug Test',
    description: 'Test event do endpoint de diagnóstico — pode apagar',
    location: 'debug',
    startAt,
    endAt,
    organizer: { name: 'EQR Debug', email: conn.apple_id_email },
    attendees: [],
    status: 'CONFIRMED',
  });
  diagnostic.steps.push({
    step: 'generate_ics',
    ok: true,
    uid: testUid,
    length: ics.length,
    sample: ics.substring(0, 600),
  });

  // Step 5: createCalendarObject — inspect raw response
  try {
    const result = await client.createCalendarObject({
      calendar: { url: conn.calendar_url },
      filename: `${testUid}.ics`,
      iCalString: ics,
    });
    const r = result as unknown as Record<string, unknown> & {
      status?: number;
      statusText?: string;
      ok?: boolean;
      url?: string;
      headers?: { entries?: () => Iterable<[string, string]> };
    };
    const headersObj: Record<string, string> = {};
    try {
      if (r.headers && typeof r.headers.entries === 'function') {
        for (const [k, v] of r.headers.entries()) headersObj[k] = v;
      }
    } catch {}
    diagnostic.steps.push({
      step: 'createCalendarObject',
      ok: r.status ? r.status >= 200 && r.status < 300 : true,
      response_status: r.status,
      response_statusText: r.statusText,
      response_ok: r.ok,
      response_url: r.url,
      response_headers: headersObj,
      response_type: typeof result,
      response_keys: typeof result === 'object' && result !== null ? Object.keys(result) : undefined,
    });
  } catch (err) {
    diagnostic.steps.push({
      step: 'createCalendarObject',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.substring(0, 1500) : undefined,
    });
  }

  return NextResponse.json(diagnostic, { status: 200 });
}
