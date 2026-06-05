import type React from 'react';
import { PublicShell } from '@/components/layout/PublicShell';

export default function PublicRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
