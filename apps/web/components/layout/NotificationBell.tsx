'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDate } from '@/lib/calendar/dateUtils';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  useEffect(() => {
    setMounted(true);
  }, []);

  const panel = (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="fixed right-4 top-14 mt-1 w-80 bg-surface-overlay border border-surface-border rounded-xl shadow-modal z-[1001]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
              <span className="text-text-primary text-sm font-medium">Notificações</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAllRead()}
                  className="text-text-muted text-xs hover:text-text-secondary transition-colors"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => void markRead(n.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-surface-elevated transition-colors border-b border-surface-border/60 last:border-0',
                      !n.read && 'bg-surface-elevated/50'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-member-blue mt-1.5 flex-shrink-0" />}
                      <div className={cn(!n.read && 'pl-0', n.read && 'pl-3.5')}>
                        <p className="text-text-primary text-xs font-medium">{n.title}</p>
                        {n.body && <p className="text-text-muted text-xs mt-0.5">{n.body}</p>}
                        <p className="text-text-muted text-[10px] mt-1">
                          {formatDate(new Date(n.created_at), 'dd/MM HH:mm')}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg hover:bg-surface-overlay transition-colors text-text-secondary hover:text-text-primary"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}
