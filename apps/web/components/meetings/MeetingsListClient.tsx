'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Clock, Eye, CheckCircle2, BarChart3, RefreshCw } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import {
  MeetingStatusBadge,
  MeetingStatCard,
  MeetingPageHeader,
} from '@/components/meetings/shared';
import {
  formatMeetingDateTime,
  meetingTimeAgo,
} from '@/lib/meetings/format';
import type { MeetingStatus, MeetingPriority } from '@/lib/meetings/statuses';

interface PartnerLite {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
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
  partners: PartnerLite[];
  hasLoadError?: boolean;
}

export function MeetingsListClient({ requests, partners }: Props) {
  const router = useRouter();
  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }

  const stats = useMemo(() => ({
    pending: requests.filter((r) => r.status === 'pending').length,
    review: requests.filter((r) => r.status === 'in_review').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    total: requests.length,
  }), [requests]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <MeetingPageHeader
          title="Reuniões"
          subtitle="Solicite uma conversa com um sócio. Acompanhe o status."
          showNewMeetingCta
          trailing={
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-md border border-surface-border hover:bg-surface-overlay transition-colors disabled:opacity-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Atualizar"
              aria-label="Atualizar"
            >
              <RefreshCw className={`w-4 h-4 text-text-muted ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MeetingStatCard icon={<Clock className="w-4 h-4" />}        value={stats.pending}  label="Pendentes"   tone="amber" />
          <MeetingStatCard icon={<Eye className="w-4 h-4" />}          value={stats.review}   label="Em análise"  tone="info" />
          <MeetingStatCard icon={<CheckCircle2 className="w-4 h-4" />} value={stats.approved} label="Aprovadas"   tone="success" />
          <MeetingStatCard icon={<BarChart3 className="w-4 h-4" />}    value={stats.total}    label="Total"       tone="gold" />
        </div>

        {/* List */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border flex items-center">
            <span className="text-text-secondary text-xs uppercase tracking-wider font-medium">
              Minhas solicitações
            </span>
            <span className="text-text-muted text-xs ml-auto">{requests.length} no total</span>
          </div>

          {requests.length === 0 ? (
            <div className="px-5 py-12 text-center text-text-muted text-sm">
              Nenhuma solicitação ainda.
              <br />
              <Link href="/meetings/new" className="text-accent hover:underline">
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
                      href={`/meetings/${r.id}`}
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
                          <span>{meetingTimeAgo(r.created_at)}</span>
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
