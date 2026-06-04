import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp, isAllowedOrigin } from '@/lib/rateLimit';

/**
 * POST /api/public/meeting-requests
 *
 * Endpoint PUBLICO (sem auth) usado pelo form /agendar.
 * Chama public_create_meeting_request via supabase com anon role.
 * A funcao SECURITY DEFINER valida tudo e bypassa RLS.
 *
 * Defesas em camada (PR #15 audit fixes):
 * - origin check (bloqueia cross-origin POST)
 * - honeypot field "website" (bots preenchem, humanos nao)
 * - rate-limit in-memory por IP: 5 req/10min + 20 req/1h
 * - zod schema valida + sanitiza
 * - SECURITY DEFINER no SQL aplica regex de phone + dedup + max length
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
  // Honeypot: campo invisivel "website" — humanos nunca preenchem
  website: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // 1) Origin check (same-origin only)
  if (!isAllowedOrigin(req)) {
    console.warn('[api/public/meeting-requests] cross-origin blocked', {
      origin: req.headers.get('origin'),
    });
    return NextResponse.json({ error: 'Origem inválida' }, { status: 403 });
  }

  // 2) Rate-limit por IP: 5/10min + 20/1h
  const ip = getClientIp(req);
  const short = rateLimit(`create:${ip}:short`, 5, 10 * 60_000);
  if (!short.ok) {
    return NextResponse.json(
      { error: 'Muitas solicitações. Tente novamente em alguns minutos.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(short.retryAfterMs / 1000)) } }
    );
  }
  const long = rateLimit(`create:${ip}:long`, 20, 60 * 60_000);
  if (!long.ok) {
    return NextResponse.json(
      { error: 'Limite de solicitações por hora atingido.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(long.retryAfterMs / 1000)) } }
    );
  }

  // 3) Parse + honeypot
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Formulário inválido' }, { status: 400 });
  }
  if (parsed.data.website && parsed.data.website.length > 0) {
    // Bot detectado — retorna 200 fake pra nao dar feedback
    console.warn('[api/public/meeting-requests] honeypot triggered', { ip });
    return NextResponse.json({ ok: true, id: '00000000-0000-0000-0000-000000000000' });
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
      } else if (lower.includes('invalid phone format')) {
        userMsg = 'Formato de telefone inválido';
        status = 422;
      } else if (lower.includes('duplicate')) {
        userMsg = 'Você já enviou uma solicitação recente com este telefone. Aguarde 10 minutos.';
        status = 429;
      } else if (lower.includes('cannot schedule more than 2 years')) {
        userMsg = 'Data muito distante (máximo 2 anos)';
        status = 422;
      } else if (lower.includes('too long')) {
        userMsg = 'Algum campo excedeu o tamanho máximo';
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
