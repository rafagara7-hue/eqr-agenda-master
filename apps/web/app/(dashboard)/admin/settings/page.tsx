'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Bell, BellOff, CheckCircle2, XCircle, AlertTriangle, Clock, Timer, CalendarDays, PanelLeft, Link2Off, Link2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAgendaSettings, type AgendaSettings } from '@/hooks/useAgendaSettings';
import { useAuth } from '@/hooks/useAuth';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MemberAvatar } from '@/components/shared/MemberAvatar';

type Theme = 'dark' | 'light';
type NotifPermission = 'granted' | 'denied' | 'default' | 'unsupported';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-text-secondary text-sm font-medium mb-3">{children}</h2>
  );
}

function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-surface-border last:border-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-text-muted">{icon}</span>
        <div>
          <p className="text-text-primary text-sm font-medium">{label}</p>
          {description && <p className="text-text-muted text-xs mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const options: { value: Theme; label: string; Icon: React.ElementType }[] = [
    { value: 'dark', label: 'Escuro', Icon: Moon },
    { value: 'light', label: 'Claro', Icon: Sun },
  ];

  return (
    <div className="flex gap-1 bg-surface-overlay rounded-lg p-1">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            theme === value
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function NotifStatus({ permission }: { permission: NotifPermission }) {
  if (permission === 'granted')
    return (
      <span className="flex items-center gap-1 text-success text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Permitido
      </span>
    );
  if (permission === 'denied')
    return (
      <span className="flex items-center gap-1 text-danger text-xs">
        <XCircle className="w-3.5 h-3.5" />
        Bloqueado pelo navegador
      </span>
    );
  if (permission === 'default')
    return (
      <span className="flex items-center gap-1 text-warning text-xs">
        <AlertTriangle className="w-3.5 h-3.5" />
        Permissão não concedida
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-text-muted text-xs">
      <XCircle className="w-3.5 h-3.5" />
      Não suportado
    </span>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [notifPermission, setNotifPermission] = useState<NotifPermission>('default');
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('eqr-theme') as Theme | null;
    setTheme(stored ?? 'dark');

    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = Notification.permission as NotifPermission;
      setNotifPermission(perm);
      setNotifEnabled(perm === 'granted' && localStorage.getItem('eqr-notif') !== 'off');
    } else {
      setNotifPermission('unsupported');
    }
  }, []);

  function applyTheme(t: Theme) {
    setTheme(t);
    localStorage.setItem('eqr-theme', t);
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(t);
  }

  async function toggleNotifications() {
    if (notifPermission === 'unsupported') return;

    if (notifPermission === 'denied') return;

    if (notifPermission === 'default') {
      const result = await Notification.requestPermission();
      setNotifPermission(result as NotifPermission);
      if (result === 'granted') {
        setNotifEnabled(true);
        localStorage.setItem('eqr-notif', 'on');
      }
      return;
    }

    if (notifEnabled) {
      setNotifEnabled(false);
      localStorage.setItem('eqr-notif', 'off');
    } else {
      setNotifEnabled(true);
      localStorage.setItem('eqr-notif', 'on');
    }
  }

  const canToggleNotif = notifPermission !== 'unsupported' && notifPermission !== 'denied';

  const { settings, update, reset } = useAgendaSettings();

  // Estado pendente para workStart / workEnd (aplicado somente ao clicar em "Aplicar")
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  const [pendingEnd,   setPendingEnd]   = useState<number | null>(null);
  const hasPendingHours = pendingStart !== null || pendingEnd !== null;

  function applyHours() {
    if (pendingStart !== null) update('workStart', pendingStart);
    if (pendingEnd   !== null) update('workEnd',   pendingEnd);
    setPendingStart(null);
    setPendingEnd(null);
  }

  function handleReset() {
    reset();
    setPendingStart(null);
    setPendingEnd(null);
  }

  const selectClass =
    'bg-surface-overlay border border-surface-border rounded-lg px-3 py-1.5 text-text-secondary text-sm outline-none focus:border-member-blue transition-colors cursor-pointer';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-text-primary text-xl font-semibold">Configurações</h1>
        <p className="text-text-muted text-sm mt-1">Preferências pessoais da sua conta</p>
      </div>

      {/* Aparência */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-elevated border border-surface-border rounded-xl px-5"
      >
        <div className="py-4 border-b border-surface-border">
          <SectionTitle>Aparência</SectionTitle>
        </div>
        <SettingRow
          icon={theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          label="Tema"
          description="Altera as cores de toda a interface"
        >
          <ThemeToggle theme={theme} onChange={applyTheme} />
        </SettingRow>
      </motion.div>

      {/* Preferências */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="bg-surface-elevated border border-surface-border rounded-xl px-5"
      >
        <div className="py-4 border-b border-surface-border">
          <SectionTitle>Preferências</SectionTitle>
        </div>
        <SettingRow
          icon={<PanelLeft className="w-4 h-4" />}
          label="Posição da barra lateral"
          description="Escolha onde a navegação aparece na tela"
        >
          <div className="flex items-center gap-2">
            {(
              [
                { value: 'left', label: 'Esquerda' },
                { value: 'right', label: 'Direita' },
                { value: 'top', label: 'Superior' },
                { value: 'bottom', label: 'Inferior' },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                title={label}
                onClick={() => update('sidebarPosition', value)}
                className={`relative w-14 h-11 rounded-lg border-2 transition-all flex flex-col items-center justify-end gap-0.5 pb-1 ${
                  settings.sidebarPosition === value
                    ? 'border-member-blue bg-member-blue/10'
                    : 'border-surface-border hover:border-surface-muted bg-surface-overlay'
                }`}
              >
                {/* Mini layout preview */}
                <div className="absolute inset-1 flex overflow-hidden rounded-sm">
                  {value === 'left' && (
                    <>
                      <div className="w-2.5 h-full bg-surface-muted rounded-sm flex-shrink-0" />
                      <div className="flex-1 h-full bg-surface-base/60 rounded-sm ml-0.5" />
                    </>
                  )}
                  {value === 'right' && (
                    <>
                      <div className="flex-1 h-full bg-surface-base/60 rounded-sm mr-0.5" />
                      <div className="w-2.5 h-full bg-surface-muted rounded-sm flex-shrink-0" />
                    </>
                  )}
                  {value === 'top' && (
                    <div className="flex flex-col w-full h-full">
                      <div className="w-full h-2.5 bg-surface-muted rounded-sm flex-shrink-0" />
                      <div className="flex-1 w-full bg-surface-base/60 rounded-sm mt-0.5" />
                    </div>
                  )}
                  {value === 'bottom' && (
                    <div className="flex flex-col w-full h-full">
                      <div className="flex-1 w-full bg-surface-base/60 rounded-sm mb-0.5" />
                      <div className="w-full h-2.5 bg-surface-muted rounded-sm flex-shrink-0" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </SettingRow>
        <div className="pb-2 pt-1">
          <p className="text-text-muted text-xs">
            {settings.sidebarPosition === 'left' && 'Barra lateral à esquerda — padrão'}
            {settings.sidebarPosition === 'right' && 'Barra lateral à direita'}
            {settings.sidebarPosition === 'top' && 'Barra de navegação no topo'}
            {settings.sidebarPosition === 'bottom' && 'Barra de navegação na parte inferior'}
          </p>
        </div>
      </motion.div>

      {/* Notificações */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="bg-surface-elevated border border-surface-border rounded-xl px-5"
      >
        <div className="py-4 border-b border-surface-border">
          <SectionTitle>Notificações</SectionTitle>
        </div>
        <SettingRow
          icon={notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          label="Notificações na área de trabalho"
          description={
            notifPermission === 'denied'
              ? 'Acesse as configurações do navegador para desbloquear notificações.'
              : 'Receba alertas de conflitos, sincronizações e lembretes.'
          }
        >
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={() => void toggleNotifications()}
              disabled={!canToggleNotif}
              className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                notifEnabled ? 'bg-success' : 'bg-surface-muted'
              } ${!canToggleNotif ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  notifEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <NotifStatus permission={notifPermission} />
          </div>
        </SettingRow>
      </motion.div>

      {/* Agenda */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="bg-surface-elevated border border-surface-border rounded-xl px-5"
      >
        <div className="py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-text-secondary text-sm font-medium">Agenda</h2>
          <div className="flex items-center gap-2">
            {hasPendingHours && (
              <button
                onClick={applyHours}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-member-blue text-white hover:bg-member-blue/90 transition-colors"
              >
                Aplicar
              </button>
            )}
            <button
              onClick={handleReset}
              className="text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              Restaurar padrões
            </button>
          </div>
        </div>

        <SettingRow
          icon={<Clock className="w-4 h-4" />}
          label="Horário de início"
          description="Primeira hora exibida ao abrir o calendário"
        >
          <select
            value={pendingStart ?? settings.workStart}
            onChange={(e) => setPendingStart(parseInt(e.target.value))}
            className={selectClass}
          >
            {Array.from({ length: 13 }, (_, i) => i + 5).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          icon={<Clock className="w-4 h-4" />}
          label="Horário de encerramento"
          description="Última hora do horário útil"
        >
          <select
            value={pendingEnd ?? settings.workEnd}
            onChange={(e) => setPendingEnd(parseInt(e.target.value))}
            className={selectClass}
          >
            {Array.from({ length: 10 }, (_, i) => i + 14).map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          icon={<Timer className="w-4 h-4" />}
          label="Duração padrão"
          description="Duração pré-preenchida ao criar um novo evento"
        >
          <select
            value={settings.defaultDuration}
            onChange={(e) => update('defaultDuration', parseInt(e.target.value))}
            className={selectClass}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hora</option>
            <option value={90}>1h 30min</option>
            <option value={120}>2 horas</option>
          </select>
        </SettingRow>

        <SettingRow
          icon={<CalendarDays className="w-4 h-4" />}
          label="Visualização padrão"
          description="View ao abrir o calendário"
        >
          <select
            value={settings.defaultView}
            onChange={(e) => update('defaultView', e.target.value as AgendaSettings['defaultView'])}
            className={selectClass}
          >
            <option value="day">Dia</option>
            <option value="week">Semana</option>
            <option value="month">Mês</option>
          </select>
        </SettingRow>
      </motion.div>

      {/* Google Calendar (Admin) — gerenciar vínculos dos sócios */}
      <AdminGoogleSection />
    </div>
  );
}

function AdminGoogleSection() {
  const { isAdmin } = useAuth();
  const supabase = getSupabaseBrowserClient();
  const queryClient = useQueryClient();
  const [disconnecting, setDisconnecting] = useState<string | 'all' | null>(null);

  const { data: linkedMembers = [], refetch } = useQuery({
    queryKey: ['admin-google-linked-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('members')
        .select('id, name, slug, color_hex, avatar_url, google_calendar_accounts(google_email, last_synced_at)')
        .eq('google_linked', true)
        .eq('is_active', true)
        .order('name');
      return (data ?? []) as Array<{
        id: string;
        name: string;
        slug: string;
        color_hex: string;
        avatar_url: string | null;
        google_calendar_accounts: { google_email: string; last_synced_at: string | null }[] | null;
      }>;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  if (!isAdmin) return null;

  async function disconnect(memberId?: string) {
    const key = memberId ?? 'all';
    if (memberId) {
      if (!confirm('Desvincular o Google Calendar deste sócio? O sync com Google para. Eventos atuais permanecem no Google.')) return;
    } else {
      if (!confirm('Desvincular o Google Calendar de TODOS os sócios? Cada um precisará reconectar pra voltar a sincronizar.')) return;
    }
    setDisconnecting(key);
    try {
      const res = await fetch('/api/google/admin-disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberId ? { memberId } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; disconnected?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Erro ao desvincular');
      toast.success(
        memberId
          ? 'Sócio desvinculado do Google Calendar'
          : `${data.disconnected ?? 0} sócio(s) desvinculado(s) do Google Calendar`
      );
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['sidebar-members'] }),
        queryClient.invalidateQueries({ queryKey: ['members-list'] }),
        queryClient.invalidateQueries({ queryKey: ['member-panel'] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desvincular');
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="bg-surface-elevated border border-surface-border rounded-xl px-5"
    >
      <div className="py-4 border-b border-surface-border flex items-center justify-between">
        <h2 className="text-text-secondary text-sm font-medium">Google Calendar dos sócios</h2>
        {linkedMembers.length > 0 && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={disconnecting === 'all'}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-danger/40 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {disconnecting === 'all' ? 'Desvinculando…' : 'Desvincular todos'}
          </button>
        )}
      </div>

      {linkedMembers.length === 0 ? (
        <div className="py-6 flex items-center gap-2 text-text-muted text-sm">
          <Link2Off className="w-4 h-4" />
          Nenhum sócio com Google Calendar vinculado.
        </div>
      ) : (
        <ul className="py-2 divide-y divide-surface-border">
          {linkedMembers.map((m) => {
            const account = m.google_calendar_accounts?.[0];
            const isBusy = disconnecting === m.id;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <MemberAvatar
                  member={{ name: m.name, colorHex: m.color_hex, avatarUrl: m.avatar_url }}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">{m.name}</p>
                  <p className="text-text-muted text-[11px] flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-success" />
                    {account?.google_email ?? '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void disconnect(m.id)}
                  disabled={isBusy || disconnecting === 'all'}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-surface-border text-text-secondary hover:border-danger/50 hover:text-danger transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
                >
                  {isBusy ? 'Desvinculando…' : 'Desvincular'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="pb-4 pt-1">
        <p className="text-text-muted text-[11px]">
          Desvincular revoga o token do Google e remove os dados do app. Eventos já criados no Google permanecem lá; novas alterações não são sincronizadas até reconectar.
        </p>
      </div>
    </motion.div>
  );
}
