'use client';

import { useState, useEffect, createContext, useContext } from 'react';

export interface AgendaSettings {
  workStart: number;
  workEnd: number;
  defaultDuration: number;
  defaultView: 'day' | 'week' | 'month';
  sidebarPosition: 'left' | 'right' | 'top' | 'bottom';
  layoutTheme: 'eqr' | 'original' | 'pro';
  language: 'pt-BR' | 'en-US';
}

const STORAGE_KEY = 'eqr-agenda-settings';

export const AGENDA_DEFAULTS: AgendaSettings = {
  workStart: 8,
  workEnd: 18,
  defaultDuration: 60,
  defaultView: 'week',
  sidebarPosition: 'left',
  layoutTheme: 'eqr',
  language: 'pt-BR',
};

interface AgendaSettingsContextType {
  settings: AgendaSettings;
  update: <K extends keyof AgendaSettings>(key: K, value: AgendaSettings[K]) => void;
  reset: () => void;
}

const AgendaSettingsContext = createContext<AgendaSettingsContextType | null>(null);

export function AgendaSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AgendaSettings>(AGENDA_DEFAULTS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSettings({ ...AGENDA_DEFAULTS, ...(JSON.parse(stored) as Partial<AgendaSettings>) });
    } catch {}
  }, []);

  function update<K extends keyof AgendaSettings>(key: K, value: AgendaSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function reset() {
    setSettings(AGENDA_DEFAULTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AGENDA_DEFAULTS));
  }

  return (
    <AgendaSettingsContext.Provider value={{ settings, update, reset }}>
      {children}
    </AgendaSettingsContext.Provider>
  );
}

export function useAgendaSettings() {
  const ctx = useContext(AgendaSettingsContext);
  // Fallback gracioso: se renderizado fora do provider (ex: SSR de rotas auth
  // antes do hidrato), retorna defaults imutáveis em vez de quebrar o build.
  if (!ctx) {
    return {
      settings: AGENDA_DEFAULTS,
      update: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

export function readAgendaSettingsSync(): AgendaSettings {
  if (typeof window === 'undefined') return AGENDA_DEFAULTS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...AGENDA_DEFAULTS, ...(JSON.parse(stored) as Partial<AgendaSettings>) } : AGENDA_DEFAULTS;
  } catch {
    return AGENDA_DEFAULTS;
  }
}
