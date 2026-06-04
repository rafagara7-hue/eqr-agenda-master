import type React from 'react';
import { StaffShell } from '@/components/layout/StaffShell';

export default function StaffRouteGroupLayout({ children }: { children: React.ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
