'use client';

import { useEffect, useState } from 'react';
import { getTopPercentage } from '@/lib/calendar/dateUtils';

interface NowLineProps {
  containerHeight?: number;
  visibleStart?: number; // hora de início da grade visível (0-24)
  hoursVisible?: number; // quantas horas estão visíveis
}

export function NowLine({ containerHeight, visibleStart = 0, hoursVisible = 24 }: NowLineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const nowHour = now.getHours() + now.getMinutes() / 60;

  // Oculta se o horário atual estiver fora da faixa visível
  if (nowHour < visibleStart || nowHour >= visibleStart + hoursVisible) return null;

  const hourHeight = containerHeight ? containerHeight / hoursVisible : null;
  const topPx = hourHeight !== null ? (nowHour - visibleStart) * hourHeight : null;
  const topPercent = getTopPercentage(now);

  return (
    <div
      className="now-line pointer-events-none"
      style={{
        top: topPx !== null ? `${topPx}px` : `${topPercent}%`,
        position: 'absolute',
        left: 0,
        right: 0,
      }}
      aria-hidden
    />
  );
}
