'use client';

import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from '@/lib/i18n';

interface ConflictingEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

interface ConflictWarningProps {
  conflicts: ConflictingEvent[];
}

export function ConflictWarning({ conflicts }: ConflictWarningProps) {
  const { t } = useTranslation();
  if (conflicts.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2.5 p-3 rounded-lg bg-sync-conflict/10 border border-sync-conflict/30"
    >
      <AlertTriangle className="w-4 h-4 text-sync-conflict flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sync-conflict text-xs font-medium">
          {conflicts.length === 1 ? t('conflict.detected.one') : `${conflicts.length} ${t('conflict.detected.many')}`}
        </p>
        <div className="mt-1 space-y-0.5">
          {conflicts.map((c) => (
            <p key={c.id} className="text-text-secondary text-xs">
              • {c.title}
            </p>
          ))}
        </div>
        <p className="text-text-muted text-xs mt-1.5">
          {t('conflict.savedAnyway')}
        </p>
      </div>
    </motion.div>
  );
}
