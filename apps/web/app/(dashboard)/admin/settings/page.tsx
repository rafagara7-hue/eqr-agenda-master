'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Bell, BellOff, AlertTriangle, Clock, Timer, CalendarDays, PanelLeft, Maximize2, Minimize2, Palette, Languages, CheckCircle2, XCircle } from 'lucide-react';
import { useAgendaSettings, type AgendaSettings } from '@/hooks/useAgendaSettings';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/lib/i18n';
import { EmailConnectorSection } from '@/components/admin/EmailConnectorSection';
import { MemberEmailSection } from '@/components/member/MemberEmailSection';
import { MemberIcalSection } from '@/components/member/MemberIcalSection';

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
  const { t } = useTranslation();
  const options: { value: Theme; label: string; Icon: React.ElementType }[] = [
    { value: 'dark',  label: t('settings.theme.dark'),  Icon: Moon },
    { value: 'light', label: t('settings.theme.light'), Icon: Sun },
  ];

  return (
    <div className="flex items-center gap-2">
      {options.map(({ value, label, Icon }) => {
        const isActive = theme === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            title={label}
            aria-label={label}
            className={`relative w-[88px] h-11 rounded-lg border-2 transition-all flex items-center justify-center gap-1.5 px-2 overflow-hidden ${
              isActive
                ? 'border-member-blue bg-member-blue/10'
                : 'border-surface-border hover:border-surface-muted bg-surface-overlay'
            }`}
          >
            {/* Preview visual do tema como background */}
            <div className="absolute inset-0 opacity-20">
              {value === 'dark' ? (
                <div className="w-full h-full bg-[#0D1B2A]" />
              ) : (
                <div className="w-full h-full bg-[#F8FAFC]" />
              )}
            </div>
            <Icon className={`relative z-10 w-4 h-4 ${isActive ? 'text-member-blue' : 'text-text-secondary'}`} />
            <span className={`relative z-10 text-xs font-medium ${isActive ? 'text-member-blue' : 'text-text-secondary'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NotifStatus({ permission }: { permission: NotifPermission }) {
  const { t } = useTranslation();
  if (permission === 'granted')
    return (
      <span className="flex items-center gap-1 text-success text-xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t('settings.notifications.granted')}
      </span>
    );
  if (permission === 'denied')
    return (
      <span className="flex items-center gap-1 text-danger text-xs">
        <XCircle className="w-3.5 h-3.5" />
        {t('settings.notifications.denied')}
      </span>
    );
  if (permission === 'default')
    return (
      <span className="flex items-center gap-1 text-warning text-xs">
        <AlertTriangle className="w-3.5 h-3.5" />
        {t('settings.notifications.pending')}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-text-muted text-xs">
      <XCircle className="w-3.5 h-3.5" />
      {t('settings.notifications.unsupported')}
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
  const [posExpanded, setPosExpanded] = useState(false);
  const { t } = useTranslation();
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
        <h1 className="text-text-primary text-xl font-semibold">{t('settings.title')}</h1>
        <p className="text-text-muted text-sm mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Aparência */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-elevated border border-surface-border rounded-xl px-5"
      >
        <div className="py-4 border-b border-surface-border">
          <SectionTitle>{t('settings.section.appearance')}</SectionTitle>
        </div>
        <SettingRow
          icon={theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          label={t('settings.theme.label')}
          description={t('settings.theme.description')}
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
          <SectionTitle>{t('settings.section.preferences')}</SectionTitle>
        </div>
        <SettingRow
          icon={<PanelLeft className="w-4 h-4" />}
          label={t('settings.sidebar.label')}
          description={t('settings.sidebar.description')}
        >
          <div className="flex items-center gap-2">
            {(() => {
              const POS_OPTIONS = [
                { value: 'left',   label: t('settings.sidebar.left') },
                { value: 'right',  label: t('settings.sidebar.right') },
                { value: 'top',    label: t('settings.sidebar.top') },
                { value: 'bottom', label: t('settings.sidebar.bottom') },
              ] as const;

              const visibleOptions = posExpanded
                ? POS_OPTIONS
                : POS_OPTIONS.filter((o) => o.value === settings.sidebarPosition);

              const renderPreview = (value: typeof POS_OPTIONS[number]['value']) => (
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
              );

              return (
                <>
                  {visibleOptions.map(({ value, label }) => (
                    <button
                      key={value}
                      title={label}
                      onClick={() => {
                        update('sidebarPosition', value);
                        if (posExpanded) setPosExpanded(false);
                      }}
                      className={`relative w-14 h-11 rounded-lg border-2 transition-all flex flex-col items-center justify-end gap-0.5 pb-1 ${
                        settings.sidebarPosition === value
                          ? 'border-member-blue bg-member-blue/10'
                          : 'border-surface-border hover:border-surface-muted bg-surface-overlay'
                      }`}
                    >
                      {renderPreview(value)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPosExpanded((v) => !v)}
                    aria-label={posExpanded ? t('settings.sidebar.collapse') : t('settings.sidebar.expand')}
                    title={posExpanded ? t('settings.sidebar.collapse') : t('settings.sidebar.expand')}
                    className="w-11 h-11 rounded-lg border-2 border-surface-border hover:border-member-blue bg-surface-overlay hover:bg-member-blue/10 transition-all flex items-center justify-center text-text-secondary hover:text-text-primary"
                  >
                    {posExpanded ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </>
              );
            })()}
          </div>
        </SettingRow>
        <div className="pb-2 pt-1">
          <p className="text-text-muted text-xs">
            {settings.sidebarPosition === 'left' && t('settings.sidebar.hint.left')}
            {settings.sidebarPosition === 'right' && t('settings.sidebar.hint.right')}
            {settings.sidebarPosition === 'top' && t('settings.sidebar.hint.top')}
            {settings.sidebarPosition === 'bottom' && t('settings.sidebar.hint.bottom')}
          </p>
        </div>

        <SettingRow
          icon={<Palette className="w-4 h-4" />}
          label={t('settings.layoutTheme.label')}
          description={t('settings.layoutTheme.description')}
        >
          <div className="flex items-center gap-2">
            {([
              { value: 'eqr',      label: 'EQR' },
              { value: 'original', label: 'Original' },
              { value: 'pro',      label: 'Pro' },
            ] as const).map(({ value, label }) => {
              const isActive = settings.layoutTheme === value;
              const previewStyle =
                value === 'eqr'
                  ? { background: 'linear-gradient(135deg, #0D1B2A 0%, #1F3550 60%, #C3A25E 100%)' }
                  : value === 'original'
                  ? { background: 'linear-gradient(135deg, #0F172A 0%, #334155 60%, #3B82F6 100%)' }
                  : { background: 'linear-gradient(135deg, #000000 0%, #1C1C1C 50%, #FFFFFF 100%)' };
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('layoutTheme', value)}
                  title={label}
                  className={`relative w-[78px] h-11 rounded-lg border-2 transition-all flex items-center justify-center text-xs font-medium overflow-hidden ${
                    isActive
                      ? 'border-member-blue'
                      : 'border-surface-border hover:border-surface-muted'
                  }`}
                >
                  <div className="absolute inset-0" style={previewStyle} />
                  <span className="relative z-10 text-white drop-shadow-md">{label}</span>
                </button>
              );
            })}
          </div>
        </SettingRow>
        <div className="pb-2 pt-1">
          <p className="text-text-muted text-xs">
            {settings.layoutTheme === 'eqr' && t('settings.layoutTheme.eqr')}
            {settings.layoutTheme === 'original' && t('settings.layoutTheme.original')}
            {settings.layoutTheme === 'pro' && t('settings.layoutTheme.pro')}
          </p>
        </div>

        <SettingRow
          icon={<Languages className="w-4 h-4" />}
          label={t('settings.language.label')}
          description={t('settings.language.description')}
        >
          <div className="flex items-center gap-1 bg-surface-overlay rounded-lg p-0.5">
            {([
              { value: 'pt-BR', label: 'PT-BR', flag: '🇧🇷' },
              { value: 'en-US', label: 'EN-US', flag: '🇺🇸' },
            ] as const).map(({ value, label, flag }) => {
              const isActive = settings.language === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('language', value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-surface-elevated text-text-primary shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span aria-hidden="true">{flag}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <div className="pb-2 pt-1">
          <p className="text-text-muted text-xs">
            {settings.language === 'pt-BR' ? t('settings.language.hint.pt') : t('settings.language.hint.en')}
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
          <SectionTitle>{t('settings.section.notifications')}</SectionTitle>
        </div>
        <SettingRow
          icon={notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          label={t('settings.notifLabel')}
          description={notifPermission === 'denied' ? t('settings.notifDescDenied') : t('settings.notifDescAllow')}
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
          <h2 className="text-text-secondary text-sm font-medium">{t('settings.section.agenda')}</h2>
          <div className="flex items-center gap-2">
            {hasPendingHours && (
              <button
                onClick={applyHours}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-member-blue text-white hover:bg-member-blue/90 transition-colors"
              >
                {t('settings.apply')}
              </button>
            )}
            <button
              onClick={handleReset}
              className="text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              {t('settings.restoreDefaults')}
            </button>
          </div>
        </div>

        <SettingRow
          icon={<Clock className="w-4 h-4" />}
          label={t('settings.workHours.startLabel')}
          description={t('settings.workHours.startDesc')}
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
          label={t('settings.workHours.endLabel')}
          description={t('settings.workHours.endDesc')}
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
          label={t('settings.defaultDuration.label')}
          description={t('settings.defaultDuration.preFilled')}
        >
          <select
            value={settings.defaultDuration}
            onChange={(e) => update('defaultDuration', parseInt(e.target.value))}
            className={selectClass}
          >
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>{t('settings.duration.1h')}</option>
            <option value={90}>{t('settings.duration.1h30')}</option>
            <option value={120}>{t('settings.duration.2h')}</option>
          </select>
        </SettingRow>

        <SettingRow
          icon={<CalendarDays className="w-4 h-4" />}
          label={t('settings.defaultView.label')}
          description={t('settings.defaultView.desc')}
        >
          <select
            value={settings.defaultView}
            onChange={(e) => update('defaultView', e.target.value as AgendaSettings['defaultView'])}
            className={selectClass}
          >
            <option value="day">{t('calendar.view.day')}</option>
            <option value="week">{t('calendar.view.week')}</option>
            <option value="month">{t('calendar.view.month')}</option>
          </select>
        </SettingRow>
      </motion.div>

      {/* Email connector (Admin) — SMTP relay pra convites .ics */}
      <AdminEmailConnectorWrapper />

      {/* Email do sócio — confirmar/trocar onde recebe convites */}
      <MemberEmailSectionWrapper />

      {/* Apple Calendar (Sócio) — compartilhar via iCal URL */}
      <MemberIcalSectionWrapper />
    </div>
  );
}

function AdminEmailConnectorWrapper() {
  const { isAdmin } = useAuth();
  return <EmailConnectorSection isAdmin={isAdmin} />;
}

function MemberEmailSectionWrapper() {
  const { isAdmin, member } = useAuth();
  return <MemberEmailSection isMember={Boolean(member)} isAdmin={isAdmin} />;
}

function MemberIcalSectionWrapper() {
  const { isAdmin, member } = useAuth();
  return <MemberIcalSection isMember={Boolean(member)} isAdmin={isAdmin} />;
}

