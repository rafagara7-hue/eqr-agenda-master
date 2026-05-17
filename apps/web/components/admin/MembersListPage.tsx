'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, User, ChevronRight, Link2Off, Link2 } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { usePresenceContext } from '@/contexts/PresenceContext';

interface MemberRow {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  google_linked: boolean;
}

interface MembersListPageProps {
  members: MemberRow[];
  currentMemberId: string;
  isAdmin: boolean;
}

export function MembersListPage({ members, currentMemberId, isAdmin }: MembersListPageProps) {
  const router = useRouter();
  const { onlineMemberIds } = usePresenceContext();

  const active = members.filter((m) => m.slug !== 'admin');
  const adminMember = members.find((m) => m.slug === 'admin');

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Membros</h1>
        <p className="text-text-muted text-sm mt-1">
          {isAdmin ? 'Clique em um membro para visualizar o perfil.' : 'Clique no seu perfil para personalizá-lo.'}
        </p>
      </div>

      {/* Grid de membros */}
      <div className="grid grid-cols-2 gap-4">
        {active.map((m, i) => {
          const isOwn = m.id === currentMemberId;
          const canClick = isAdmin || isOwn;
          const isOnline = onlineMemberIds.has(m.id);

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => canClick && router.push(`/admin/members/${m.id}`)}
              className={`relative bg-surface-elevated border border-surface-border rounded-xl p-3 sm:p-5 transition-all group
                ${canClick ? 'cursor-pointer hover:border-surface-muted hover:shadow-card-hover' : 'opacity-70'}`}
              style={{ borderLeftColor: m.color_hex, borderLeftWidth: 3 }}
            >
              {/* Badge próprio */}
              {isOwn && (
                <span className="absolute top-3 right-3 text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-muted text-text-muted">
                  Você
                </span>
              )}

              <div className="flex items-center gap-4 mb-4">
                <div className="relative flex-shrink-0">
                  <MemberAvatar
                    member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                    size="lg"
                  />
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-surface-elevated ${
                      isOnline ? 'bg-success' : 'bg-surface-muted'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-semibold text-base truncate">{m.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <User className="w-3 h-3 text-text-muted" />
                    <span className="text-text-muted text-xs capitalize">{m.role}</span>
                    <span className={`text-[10px] font-medium ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                      · {isOnline ? 'online' : 'offline'}
                    </span>
                  </div>
                </div>
                {canClick && (
                  <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                  style={{ backgroundColor: m.color_hex }}
                >
                  {m.color_hex}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${m.google_linked ? 'text-success' : 'text-text-muted'}`}>
                  {m.google_linked ? <Link2 className="w-3 h-3" /> : <Link2Off className="w-3 h-3" />}
                  {m.google_linked ? 'Google vinculado' : 'Sem Google'}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Admin separado */}
      {isAdmin && adminMember && (
        <div>
          <h2 className="text-text-secondary text-sm font-medium mb-3">Administrador</h2>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => router.push(`/admin/members/${adminMember.id}`)}
            className="flex items-center gap-4 bg-surface-elevated border border-surface-border rounded-xl p-4 cursor-pointer hover:border-surface-muted transition-all group max-w-sm"
          >
            <MemberAvatar
              member={{ name: adminMember.name, colorHex: adminMember.color_hex, avatarUrl: adminMember.avatar_url }}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <p className="text-text-primary font-medium text-sm">{adminMember.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Shield className="w-3 h-3 text-member-blue" />
                <span className="text-member-blue text-xs">Admin</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
