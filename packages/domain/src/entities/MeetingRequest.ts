export type MeetingRequestStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'expired';

export type MeetingRequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export type MeetingRequestAction =
  | 'created'
  | 'submitted'
  | 'viewed'
  | 'commented'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'reschedule_suggested'
  | 'reschedule_accepted'
  | 'reschedule_declined'
  | 'event_created'
  | 'completed';

export interface MeetingRequest {
  id: string;
  requesterId: string;
  targetPartnerId: string;
  title: string;
  description: string | null;
  observations: string | null;
  proposedStart: Date;
  proposedEnd: Date;
  durationMinutes: number;
  priority: MeetingRequestPriority;
  status: MeetingRequestStatus;
  reviewerId: string | null;
  reviewedAt: Date | null;
  decisionReason: string | null;
  suggestedStart: Date | null;
  suggestedEnd: Date | null;
  suggestedAt: Date | null;
  resultingEventId: string | null;
  detectedConflicts: ConflictSnapshot[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConflictSnapshot {
  eventId: string;
  title: string;
  startAt: string;
  endAt: string;
  overlapMin: number;
}

export interface MeetingRequestParticipant {
  id: string;
  meetingRequestId: string;
  memberId: string;
  optional: boolean;
  createdAt: Date;
}

export interface MeetingRequestEvent {
  id: string;
  meetingRequestId: string;
  actorId: string | null;
  action: MeetingRequestAction;
  fromStatus: MeetingRequestStatus | null;
  toStatus: MeetingRequestStatus | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface MeetingRequestComment {
  id: string;
  meetingRequestId: string;
  authorId: string;
  body: string;
  visibleToRequester: boolean;
  createdAt: Date;
}

export interface CreateMeetingRequestInput {
  requesterId: string;
  targetPartnerId: string;
  title: string;
  description?: string;
  observations?: string;
  proposedStart: Date;
  proposedEnd: Date;
  priority?: MeetingRequestPriority;
  participantIds?: string[];
}

export interface ApproveMeetingRequestInput {
  requestId: string;
  reviewerId: string;
  decisionNote?: string;
}

export interface RejectMeetingRequestInput {
  requestId: string;
  reviewerId: string;
  reason: string;
}

export interface SuggestRescheduleInput {
  requestId: string;
  partnerId: string;
  newStart: Date;
  newEnd: Date;
  message?: string;
}
