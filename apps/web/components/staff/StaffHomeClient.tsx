'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Clock, Eye, CheckCircle2, BarChart3 } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingStatusBadge,
  MeetingStatCard,
  MeetingErrorBanner,
} from '@/components/meetings/shared';
import {
  formatMeetingDateTime,
  meetingTimeAgo,
} from '@/lib/meetings/format';
import type { MeetingStatus, MeetingPriority } from '@/lib/meetings/statuses';

interface MemberLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
}

interface RequestRow {
  id: string;
  title: string;
  target_partner_id: string;
  proposed_start: string;
  proposed_end: string;
  status: MeetingStatus;
  priority: MeetingPriority;
  created_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
}

interface Props {
  member: { id: string; name: string };
  requests: RequestRow[];
  partners: MemberLite[];
  hasLoadError?: boolean;
}

export function StaffHomeClient({ member, requests, partners, hasLoadError }: Props) {
  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending' || r.status === 'in_review').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    total: requests.length,
  }), [requests]);

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Saudacao + CTA primario */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-text-primary text-xl font-semibold">
              Olá, {member.name.split(' ')[0]}
            </h1>
            <p className="text-text-muted text-sm mt-1">
              Solicite uma reunião com um sócio.
            </p>
          </div>
          <Link
            href="/staff/nova-reuniao"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-md bg-accent text-brand hover:bg-accent-bright transition-colors min-h-[44px] shrink-0"
            style={{ color: '#0D1B2A' }}
          >
            <Plus className="w-4 h-4" />
            Nova solicitação
          </Link>
        </div>

        <MeetingErrorBanner visible={!!hasLoadError} />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}        value={stats.pending}  label="Aguardando" tone="amber" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />} value={stats.approved} label="Aprovadas"  tone="success" />
          <MeetingStatCard icon={<Eye className="w-4 h-4" />}          value={stats.rejected} label="Rejeitadas" tone="danger" />
          <MeetingStatCard icon={<BarChart3 className="w-4 h-4" />}    value={stats.total}    label="Total"      tone="gold" />
        </div>

        {/* Lista */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Minhas solicitações
            </span>
            <span className="text-text-muted text-xs ml-auto">{requests.length} no total</span>
          </div>

          {requests.length === 0 ? (
            <div className="px-5 py-12 text-center text-text-muted text-sm">
              Você ainda não fez nenhuma solicitação.
              <br />
              <Link href="/staff/nova-reuniao" className="text-accent hover:underline mt-2 inline-block">
                Criar a primeira →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-surface-border">
              {requests.map((r, idx) => {
                const partner = partnerById.get(r.target_partner_id);
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <Link
                      href={`/staff/solicitacao/${r.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-overlay transition-colors"
                    >
                      {partner && (
                        <MemberAvatar
                          member={{ name: partner.name, colorHex: partner.color_hex, avatarUrl: partner.avatar_url }}
                          size="md"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate">
                          {r.title}
                        </p>
                        <p className="text-text-muted text-xs mt-0.5">
                          com <span className="text-text-secondary">{partner?.name ?? '?'}</span>
                          {' · '}
                          {formatMeetingDateTime(r.proposed_start)}
                          {' · '}
                          {meetingTimeAgo(r.created_at)}
                          {r.status === 'rejected' && r.decision_reason && (
                            <> · <span className="text-danger">"{r.decision_reason}"</span></>
                          )}
                        </p>
                      </div>
                      <MeetingStatusBadge status={r.status} className="flex-shrink-0" />
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
