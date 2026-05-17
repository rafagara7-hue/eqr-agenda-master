'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { CalendarDays, Users, Settings, Shield, LogOut, ChevronRight, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useSignOut } from '@/hooks/useAuth';
import { usePresenceContext } from '@/contexts/PresenceContext';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  adminOnly?: boolean;
  memberOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/calendar',       icon: CalendarDays, label: 'Calendário' },
  { href: '/admin',          icon: Shield,       label: 'Geral',          adminOnly: true },
  { href: '/geral',          icon: BarChart3,    label: 'Geral',          memberOnly: true },
  { href: '/admin/members',  icon: Users,        label: 'Membros',        adminOnly: true },
  { href: '/admin/settings', icon: Settings,     label: 'Configurações' },
];

interface SidebarProps {
  position?: 'left' | 'right' | 'top' | 'bottom';
}

export function Sidebar({ position = 'left' }: SidebarProps) {
  const pathname = usePathname();
  const { member, isAdmin, isLoading } = useAuth();
  const signOut = useSignOut();
  const { onlineMemberIds } = usePresenceContext();
  const supabase = getSupabaseBrowserClient();

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

  // Color used for logo background and avatar glow — gray for admin
  const memberColor = isAdmin ? '#6B7280' : (member?.colorHex ?? '#6B7280');

  // ── Horizontal layout (top / bottom) ──────────────────────────────────────
  if (position === 'top' || position === 'bottom') {
    return (
      <aside
        className={cn(
          'fixed left-0 right-0 h-14 bg-surface-elevated z-20 flex items-center px-2 sm:px-4 gap-2 sm:gap-3',
          position === 'top' ? 'top-0 border-b' : 'bottom-0 border-t',
          'border-surface-border'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: memberColor }}>
            <span className="text-white text-xs font-bold">EQR</span>
          </div>
          <span className="text-text-primary text-sm font-semibold hidden sm:block">Agenda</span>
        </div>

        <div className="w-px h-5 bg-surface-border flex-shrink-0 hidden sm:block" />

        {/* Nav items */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/calendar' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-surface-overlay text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Member presence dots — desktop only */}
        {isAdmin && sidebarMembers.length > 0 && (
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
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
                    className="w-2.5 h-2.5 rounded-full block"
                    style={{ backgroundColor: m.color_hex }}
                  />
                  <span
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-surface-elevated',
                      isOnline ? 'bg-success' : 'bg-surface-muted'
                    )}
                  />
                </Link>
              );
            })}
          </div>
        )}

        {/* User */}
        {member && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 border-l border-surface-border pl-2 sm:pl-3">
            <Link
              href={{ pathname, query: { profile: member.id } }}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg hover:bg-surface-overlay/60 transition-colors"
              title="Ver meu perfil"
            >
              <div className="rounded-full flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${memberColor}, 0 0 8px ${memberColor}80` }}>
                <MemberAvatar member={member} size="sm" />
              </div>
              <span className="text-text-primary text-xs font-medium hidden md:block truncate max-w-[80px]">
                {member.name}
              </span>
            </Link>
            <button
              onClick={() => void signOut()}
              className="p-1.5 rounded-md hover:bg-surface-overlay transition-colors"
              title="Sair"
            >
              <LogOut className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>
        )}
      </aside>
    );
  }

  // ── Vertical layout (left / right) ────────────────────────────────────────
  return (
    <>
      {/* Desktop: vertical sidebar */}
      <aside
        className={cn(
          'hidden md:flex fixed top-0 bottom-0 w-[240px] bg-surface-elevated z-20 flex-col',
          position === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          'border-surface-border'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: memberColor }}>
              <span className="text-white text-xs font-bold">EQR</span>
            </div>
            <div>
              <p className="text-text-primary text-sm font-semibold leading-none">Agenda Master</p>
              <p className="text-text-muted text-[10px] mt-0.5">Central corporativa</p>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-2 space-y-0.5">
            {visibleItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/calendar' && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href}>
                  <motion.div
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-100',
                      isActive
                        ? 'bg-surface-overlay text-text-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'
                    )}
                    whileHover={{ x: position === 'right' ? -2 : 2 }}
                    transition={{ duration: 0.1 }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 text-text-muted" />}
                  </motion.div>
                </Link>
              );
            })}
          </div>

          {/* Membros */}
          {isAdmin && sidebarMembers.length > 0 && (
            <div className="mt-4 px-4">
              <p className="text-text-muted text-[10px] font-medium uppercase tracking-wider mb-2">
                Membros
              </p>
              <div className="space-y-1">
                {sidebarMembers.map((m) => {
                  const isOnline = onlineMemberIds.has(m.id);
                  return (
                    <Link
                      key={m.id}
                      href={{ pathname, query: { profile: m.id } }}
                      className="flex items-center gap-2 py-1 rounded-md px-1 -mx-1 hover:bg-surface-overlay/60 transition-colors"
                    >
                      <div className="relative flex-shrink-0">
                        <span
                          className="w-2 h-2 rounded-full block"
                          style={{ backgroundColor: m.color_hex }}
                        />
                        <span
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-surface-elevated',
                            isOnline ? 'bg-success' : 'bg-surface-muted'
                          )}
                        />
                      </div>
                      <span className="text-text-secondary text-xs flex-1 truncate">{m.name}</span>
                      <span className={`text-[10px] ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                        {isOnline ? 'online' : 'offline'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* Perfil do usuário */}
        {member && (
          <div className="border-t border-surface-border p-3">
            <div className="flex items-center gap-2.5">
              <Link
                href={{ pathname, query: { profile: member.id } }}
                className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg hover:bg-surface-overlay/60 transition-colors"
                title="Ver meu perfil"
              >
                <div className="rounded-full flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${memberColor}, 0 0 8px ${memberColor}80` }}>
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
                title="Sair"
              >
                <LogOut className="w-3.5 h-3.5 text-text-muted" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile: bottom navigation bar */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 h-14 bg-surface-elevated border-t border-surface-border z-20 items-center justify-around px-1">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/calendar' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[48px] min-h-[48px]',
                isActive ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
        {member && (
          <button
            onClick={() => void signOut()}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[48px] min-h-[48px] text-text-muted hover:text-text-secondary"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">Sair</span>
          </button>
        )}
      </nav>
    </>
  );
}
