/**
 * Delete bidirecional de event apple_caldav.
 *
 * Quando user apaga no EQR um event que veio do pull inbound, propaga a
 * deleção pro Apple Calendar do sócio. Sem isso, o próximo pull re-importa
 * o event que o usuário pensou que tinha apagado (frustração garantida).
 *
 * Algoritmo:
 *   1. Lê caldav_connection do dono do event (member_id)
 *   2. Conecta CalDAV — discovery retorna todas coleções VEVENT-capable
 *   3. Procura o UID em todas — deleta na primeira (e segue best-effort se
 *      por algum motivo estiver em duas)
 *   4. Retorna sucesso mesmo se evento já tiver sumido do Apple (idempotente)
 *
 * Caller (route.ts DELETE handler) deve:
 *   - Chamar essa função ANTES de deletar do DB
 *   - Se falhar, abortar com erro claro (não deletar do DB)
 *   - Se sucesso, deletar do DB normalmente
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import { decrypt } from '@/lib/email/cryptoUtil';
import { connectCalDAV, deleteEventFromAllCalendars } from './client';

type ServiceDb = SupabaseClient<Database>;

export interface DeleteInboundResult {
  ok: boolean;
  error?: string;
  deletedFromCalendars?: string[];
}

interface CaldavConnRow {
  id: string;
  apple_id_email: string;
  app_password_encrypted: string;
  verified_at: string | null;
}

export async function deleteAppleEventForMember(
  serviceDb: ServiceDb,
  memberId: string,
  externalEventId: string
): Promise<DeleteInboundResult> {
  // 1. Busca conexão verificada
  const { data: rawConn } = await serviceDb
    .from('caldav_connections')
    .select('id, apple_id_email, app_password_encrypted, verified_at')
    .eq('member_id', memberId)
    .maybeSingle();
  const conn = rawConn as CaldavConnRow | null;
  if (!conn || !conn.verified_at) {
    return { ok: false, error: 'no-verified-caldav-connection' };
  }

  // 2. Decripta + conecta
  let appPassword: string;
  try {
    appPassword = decrypt(conn.app_password_encrypted);
  } catch (err) {
    return { ok: false, error: `decrypt: ${err instanceof Error ? err.message : String(err)}` };
  }
  const connResult = await connectCalDAV({
    appleIdEmail: conn.apple_id_email,
    appPassword,
  });
  if (!connResult.ok) {
    return { ok: false, error: `connect: ${connResult.error}` };
  }

  // 3. Deleta procurando em todas coleções (não sabemos em qual o event mora)
  const delResult = await deleteEventFromAllCalendars(
    connResult.client,
    connResult.calendars,
    externalEventId
  );
  if (!delResult.ok) {
    return { ok: false, error: delResult.error };
  }

  return {
    ok: true,
    deletedFromCalendars: delResult.deletedFromCalendars,
  };
}
