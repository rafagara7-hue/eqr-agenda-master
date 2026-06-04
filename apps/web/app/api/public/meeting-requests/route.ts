import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/public/meeting-requests
 *
 * Endpoint PUBLICO (sem auth) usado pelo form /agendar.
 * Chama public_create_meeting_request via supabase com anon role.
 * A funcao SECURITY DEFINER valida tudo e bypassa RLS.
 */

const bodySchema = z.object({
  externalName: z.string().min(2).max(120),
  externalPhone: z.string().min(8).max(40),
  targetPartnerId: z.string().uuid(),
  title: z.string().min(3).max(200),
  proposedStart: z.string(),
  proposedEnd: z.string(),
  description: z.string().max(2000).optional(),
  observations: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Formulário inválido' }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  try {
    const { data, error } = await supabase.rpc('public_create_meeting_request', {
      p_external_name: parsed.data.externalName.trim(),
      p_external_phone: parsed.data.externalPhone.trim(),
      p_target_partner_id: parsed.data.targetPartnerId,
      p_title: parsed.data.title.trim(),
      p_proposed_start: parsed.data.proposedStart,
      p_proposed_end: parsed.data.proposedEnd,
      p_description: parsed.data.description ?? null,
      p_observations: parsed.data.observations ?? null,
    });

    if (error) {
      const raw = error.message;
      console.error('[api/public/meeting-requests] failed', {
        target: parsed.data.targetPartnerId,
        error: raw,
      });
      const lower = raw.toLowerCase();
      let userMsg = 'Erro ao enviar solicitação';
      let status = 400;
      if (lower.includes('not found')) {
        userMsg = 'Sócio não encontrado';
        status = 404;
      } else if (lower.includes('target must be partner')) {
        userMsg = 'Destinatário inválido';
        status = 422;
      } else if (lower.includes('invalid time range')) {
        userMsg = 'Horário inválido: o fim precisa ser depois do início';
        status = 422;
      } else if (lower.includes('invalid duration')) {
        userMsg = 'Duração inválida: máximo 8 horas';
        status = 422;
      } else if (lower.includes('cannot schedule in the past')) {
        userMsg = 'Não é possível agendar no passado';
        status = 422;
      } else if (lower.includes('name required')) {
        userMsg = 'Nome inválido (mínimo 2 caracteres)';
        status = 422;
      } else if (lower.includes('phone required')) {
        userMsg = 'Telefone inválido (mínimo 8 dígitos)';
        status = 422;
      } else if (lower.includes('title required')) {
        userMsg = 'Assunto muito curto (mínimo 3 caracteres)';
        status = 422;
      }
      return NextResponse.json({ error: userMsg }, { status });
    }

    return NextResponse.json({ ok: true, id: data });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Erro';
    console.error('[api/public/meeting-requests] unexpected', { error: raw });
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 });
  }
}
