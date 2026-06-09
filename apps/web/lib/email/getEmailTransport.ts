/**
 * Seletor de transporte de email.
 *
 * Lógica:
 *   1. Se admin tem `admin_email_smtp_settings` com `verified_at IS NOT NULL` → usa SMTP
 *   2. Senão, fallback Resend (precisa de RESEND_API_KEY)
 *
 * O `verified_at` é o guard — config não testada não é usada pra evitar usar
 * credencial quebrada em produção.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@eqr/database';
import type { SmtpConfig } from './smtpTransport';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

type ServiceDb = SupabaseClient<Database>;

export type EmailTransport =
  | { kind: 'smtp'; config: SmtpConfig }
  | { kind: 'resend' };

interface SmtpRow {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password_encrypted: string;
  from_address: string;
  from_name: string;
  verified_at: string | null;
}

export async function getEmailTransport(
  serviceDb: ServiceDb
): Promise<EmailTransport> {
  try {
    const { data } = await serviceDb
      .from('admin_email_smtp_settings')
      .select(
        'smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password_encrypted, from_address, from_name, verified_at'
      )
      .eq('id', SINGLETON_ID)
      .maybeSingle();

    const row = data as SmtpRow | null;

    if (row && row.verified_at) {
      return {
        kind: 'smtp',
        config: {
          host: row.smtp_host,
          port: row.smtp_port,
          secure: row.smtp_secure,
          username: row.smtp_username,
          passwordEncrypted: row.smtp_password_encrypted,
          fromAddress: row.from_address,
          fromName: row.from_name,
        },
      };
    }
  } catch (err) {
    console.warn(
      '[getEmailTransport] failed to load SMTP, falling back to Resend',
      err
    );
  }

  return { kind: 'resend' };
}
