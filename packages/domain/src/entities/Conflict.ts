export interface Conflict {
  id: string;
  memberId: string;
  eventIdA: string;
  eventIdB: string;
  overlapStart: Date;
  overlapEnd: Date;
  resolved: boolean;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

export interface ConflictWithEvents extends Conflict {
  eventA: { id: string; title: string; startAt: Date; endAt: Date };
  eventB: { id: string; title: string; startAt: Date; endAt: Date };
}
