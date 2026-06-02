'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Users, Settings, Shield, LogOut, ChevronRight, BarChart3, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useSignOut } from '@/hooks/useAuth';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { EqrLogo } from '@/components/shared/EqrLogo';
import { useTranslation } from '@/lib/i18n';

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  adminOnly?: boolean;
  memberOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/calendar',       icon: CalendarDays,   labelKey: 'nav.calendar' },
  { href: '/admin',          icon: Shield,         labelKey: 'nav.general',   adminOnly: true },
  { href: '/geral',          icon: BarChart3,      labelKey: 'nav.general',   memberOnly: true },
  { href: '/admin/members',  icon: Users,          labelKey: 'nav.members',   adminOnly: true },
  { href: '/feedback',       icon: MessageSquare,  labelKey: 'nav.feedback' },
  { href: '/admin/settings', icon: Settings,       labelKey: 'nav.settings' },
];

function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/admin/members' && pathname.startsWith('/admin/members/')) return true;
  return false;
}

interface SidebarProps {
  position?: 'left' | 'right' | 'top' | 'bottom';
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ position = 'left', isOpen = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { member, isAdmin, isLoading } = useAuth();
  const signOut = useSignOut();
  const { onlineMemberIds } = usePresenceContext();
  const supabase = getSupabaseBrowserClient();
  const { t } = useTranslation();

  const { data: sidebarMembers = [] } = useQuery({
    queryKey: ['sidebar-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('id, name, color_hex, avatar_url')
        .eq('is_active', true)
        .neq('slug', 'admin')
        .order('name');
      return data ?? [];
    },
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return isAdmin || isLoading;
    if (item.memberOnly) return !isAdmin && !isLoading;
    return true;
  });

  // Admin usa anel dourado EQR (destaca a logo contra o fundo escuro); membros usam a cor pessoal.
  const memberColor = isAdmin ? '#C9A85C' : (member?.colorHex ?? '#6B7280');

  // ── Horizontal layout (top / bottom) — barra fixa ──
  // Quando posição = "top", barra fica maior (mais altura, ícones e textos)
  // pra ter cara de header principal. "bottom" mantém compacto (barra de tabs).
  if (position === 'top' || position === 'bottom') {
    const isTop = position === 'top';
    return (
      <aside
        className={cn(
          'fixed left-0 right-0 bg-surface-elevated z-20 flex items-center gap-2 sm:gap-3',
          isTop
            ? 'top-0 border-b h-[68px] px-3 sm:px-5'
            : 'bottom-0 border-t h-14 px-2 sm:px-4',
          'border-surface-border'
        )}
      >
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <EqrLogo blend className={cn('rounded-full ring-2 ring-accent', isTop ? 'w-10 h-10' : 'w-7 h-7')} />
          <span
            className={cn(
              'text-text-primary font-semibold hidden sm:block',
              isTop ? 'text-base' : 'text-sm'
            )}
          >
            Agenda
          </span>
        </div>

        <div className={cn('w-px bg-surface-border flex-shrink-0 hidden sm:block', isTop ? 'h-7' : 'h-5')} />

        <nav className={cn('flex items-center flex-1 overflow-x-auto', isTop ? 'gap-1' : 'gap-0.5')}>
          {visibleItems.map((item) => {
            const isActive = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    'flex items-center rounded-lg transition-colors whitespace-nowrap',
                    isTop
                      ? 'gap-2 px-3.5 py-2.5 text-[15px] font-medium'
                      : 'gap-1.5 px-2.5 py-1.5 text-sm',
                    isActive
                      ? 'bg-accent/15 text-accent ring-1 ring-accent/25'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'
                  )}
                >
                  <Icon className={cn('flex-shrink-0', isTop ? 'w-[22px] h-[22px]' : 'w-4 h-4')} />
                  <span className="hidden sm:inline">{t(item.labelKey)}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {isAdmin && sidebarMembers.length > 0 && (
          <div className={cn('hidden md:flex items-center flex-shrink-0', isTop ? 'gap-2.5' : 'gap-2')}>
            {sidebarMembers.map((m) => {
              const isOnline = onlineMemberIds.has(m.id);
              return (
                <Link
                  key={m.id}
                  href={{ pathname, query: { profile: m.id } }}
                  title={m.name}
                  className="relative"
                >
                  <span
                    className={cn('rounded-full block', isTop ? 'w-3 h-3' : 'w-2.5 h-2.5')}
                    style={{ backgroundColor: m.color_hex }}
                  />
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 rounded-full border border-surface-elevated',
                      isOnline ? 'bg-success' : 'bg-surface-muted',
                      isTop ? 'w-2 h-2' : 'w-1.5 h-1.5'
                    )}
                  />
                </Link>
              );
            })}
          </div>
        )}

        {member && (
          <div
            className={cn(
              'flex items-center flex-shrink-0 border-l border-surface-border',
              isTop ? 'gap-2 sm:gap-2.5 pl-3 sm:pl-4' : 'gap-1.5 sm:gap-2 pl-2 sm:pl-3'
            )}
          >
            <Link
              href={{ pathname, query: { profile: member.id } }}
              className={cn(
                'flex items-center rounded-lg hover:bg-surface-overlay/60 transition-colors',
                isTop ? 'gap-2 sm:gap-2.5' : 'gap-1.5 sm:gap-2'
              )}
              title={t('nav.profile')}
            >
              <div className="rounded-full flex-shrink-0" style={isAdmin ? undefined : { boxShadow: `0 0 0 2px ${memberColor}, 0 0 8px ${memberColor}80` }}>
                <MemberAvatar member={member} size={isTop ? 'md' : 'sm'} />
              </div>
              <span
                className={cn(
                  'text-text-primary font-medium hidden md:block truncate',
                  isTop ? 'text-sm max-w-[100px]' : 'text-xs max-w-[80px]'
                )}
              >
                {member.name}
              </span>
            </Link>
            <button
              onClick={() => void signOut()}
              className={cn(
                'rounded-md hover:bg-surface-overlay transition-colors',
                isTop ? 'p-2' : 'p-1.5'
              )}
              title={t('nav.signOut')}
            >
              <LogOut className={cn('text-text-muted', isTop ? 'w-[18px] h-[18px]' : 'w-3.5 h-3.5')} />
            </button>
          </div>
        )}
      </aside>
    );
  }

  // ── Vertical layout (left / right) — painel deslizante estilo calendário ──
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: position === 'left' ? '-105%' : '105%' }}
          animate={{ x: 0 }}
          exit={{ x: position === 'left' ? '-105%' : '105%' }}
          transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.28 }}
          drag="x"
          dragConstraints={
            position === 'left' ? { left: -500, right: 0 } : { left: 0, right: 500 }
          }
          dragElastic={0.05}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            const threshold = 80;
            if (position === 'left' && info.offset.x < -threshold) onClose?.();
            if (position === 'right' && info.offset.x > threshold) onClose?.();
          }}
          className={cn(
            'fixed top-0 bottom-0 w-[280px] max-w-[85vw] bg-surface-elevated z-40 flex flex-col shadow-2xl',
            position === 'left' ? 'left-0 border-r' : 'right-0 border-l',
            'border-surface-border'
          )}
        >
          {/* Header: logo + botão fechar */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-surface-border flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <EqrLogo blend className="w-7 h-7 rounded-full ring-2 ring-accent flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-text-primary text-sm font-semibold leading-none truncate">{t('login.title')}</p>
                <p className="text-text-muted text-[10px] mt-0.5 truncate">{t('login.subtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('nav.closeMenu')}
              className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Navegação */}
          <nav className="flex-1 py-3 overflow-y-auto">
            <div className="px-2 space-y-0.5">
              {visibleItems.map((item) => {
                const isActive = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={onClose}>
                    <div
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors relative',
                        isActive
                          ? 'bg-accent/15 text-accent font-medium'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'
                      )}
                    >
                      {/* Barra dourada à esquerda no item ativo — detalhe EQR */}
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {isActive && <ChevronRight className="w-3 h-3 text-accent" />}
                    </div>
                  </Link>
                );
              })}
            </div>

            {isAdmin && sidebarMembers.length > 0 && (
              <div className="mt-4 px-4">
                <p className="text-text-muted text-[10px] font-medium uppercase tracking-wider mb-2">
                  {t('nav.members')}
                </p>
                <div className="space-y-1">
                  {sidebarMembers.map((m) => {
                    const isOnline = onlineMemberIds.has(m.id);
                    return (
                      <Link
                        key={m.id}
                        href={{ pathname, query: { profile: m.id } }}
                        onClick={onClose}
                        className="flex items-center gap-2 py-1 rounded-md px-1 -mx-1 hover:bg-surface-overlay/60 transition-colors"
                      >
                        <div className="relative flex-shrink-0">
                          <span className="w-2 h-2 rounded-full block" style={{ backgroundColor: m.color_hex }} />
                          <span
                            className={cn(
                              'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-surface-elevated',
                              isOnline ? 'bg-success' : 'bg-surface-muted'
                            )}
                          />
                        </div>
                        <span className="text-text-secondary text-xs flex-1 truncate">{m.name}</span>
                        <span className={`text-[10px] ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                          {isOnline ? t('common.online') : t('common.offline')}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>

          {/* Rodapé: perfil + sair */}
          {member && (
            <div className="border-t border-surface-border p-3 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <Link
                  href={{ pathname, query: { profile: member.id } }}
                  onClick={onClose}
                  className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg hover:bg-surface-overlay/60 transition-colors"
                  title={t('nav.profile')}
                >
                  <div className="rounded-full flex-shrink-0" style={isAdmin ? undefined : { boxShadow: `0 0 0 2px ${memberColor}, 0 0 8px ${memberColor}80` }}>
                    <MemberAvatar member={member} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text-primary text-xs font-medium truncate">{member.name}</p>
                    <p className="text-text-muted text-[10px] capitalize">{member.role}</p>
                  </div>
                </Link>
                <button
                  onClick={() => void signOut()}
                  className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors"
                  title={t('nav.signOut')}
                >
                  <LogOut className="w-3.5 h-3.5 text-text-muted" />
                </button>
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
