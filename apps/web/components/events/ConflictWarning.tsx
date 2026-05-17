import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

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
          {conflicts.length === 1 ? 'Conflito detectado' : `${conflicts.length} conflitos detectados`}
        </p>
        <div className="mt-1 space-y-0.5">
          {conflicts.map((c) => (
            <p key={c.id} className="text-text-secondary text-xs">
              • {c.title}
            </p>
          ))}
        </div>
        <p className="text-text-muted text-xs mt-1.5">
          O evento será salvo, mas o conflito ficará registrado para revisão.
        </p>
      </div>
    </motion.div>
  );
}
