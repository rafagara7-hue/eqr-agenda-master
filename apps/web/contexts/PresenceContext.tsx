'use client';

import { createContext, useContext } from 'react';
import { usePresence } from '@/hooks/usePresence';

interface PresenceContextType {
  onlineMemberIds: Set<string>;
}

const PresenceContext = createContext<PresenceContextType>({ onlineMemberIds: new Set() });

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { onlineMemberIds } = usePresence();
  return (
    <PresenceContext.Provider value={{ onlineMemberIds }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext() {
  return useContext(PresenceContext);
}
