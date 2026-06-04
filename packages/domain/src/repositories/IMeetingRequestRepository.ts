import type {
  MeetingRequest,
  MeetingRequestComment,
  MeetingRequestEvent,
  MeetingRequestStatus,
  CreateMeetingRequestInput,
  ApproveMeetingRequestInput,
  RejectMeetingRequestInput,
  SuggestRescheduleInput,
} from '../entities/MeetingRequest.js';

export interface MeetingRequestFilter {
  status?: MeetingRequestStatus[];
  requesterId?: string;
  targetPartnerId?: string;
  priority?: string;
  startAfter?: Date;
  startBefore?: Date;
}

export interface MeetingRequestWithDetails extends MeetingRequest {
  participantIds: string[];
}

export interface IMeetingRequestRepository {
  findById(id: string): Promise<MeetingRequestWithDetails | null>;
  findAll(filter?: MeetingRequestFilter): Promise<MeetingRequest[]>;
  create(input: CreateMeetingRequestInput): Promise<MeetingRequest>;
  cancel(id: string, requesterId: string): Promise<void>;
  approve(input: ApproveMeetingRequestInput): Promise<string>; // returns event_id
  reject(input: RejectMeetingRequestInput): Promise<void>;
  suggestReschedule(input: SuggestRescheduleInput): Promise<void>;
  getHistory(id: string): Promise<MeetingRequestEvent[]>;
  getComments(id: string): Promise<MeetingRequestComment[]>;
  addComment(input: { meetingRequestId: string; authorId: string; body: string; visibleToRequester?: boolean }): Promise<MeetingRequestComment>;
}
