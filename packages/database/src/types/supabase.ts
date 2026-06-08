export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          slug: string;
          color: string;
          color_hex: string;
          role: 'admin' | 'member' | 'employee';
          is_active: boolean;
          avatar_url: string | null;
          calendar_linked: boolean;
          calendar_share_token: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          color: string;
          color_hex: string;
          role?: 'admin' | 'member' | 'employee';
          is_active?: boolean;
          avatar_url?: string | null;
          calendar_linked?: boolean;
          calendar_share_token?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          slug?: string;
          color?: string;
          color_hex?: string;
          role?: 'admin' | 'member' | 'employee';
          is_active?: boolean;
          avatar_url?: string | null;
          calendar_linked?: boolean;
          calendar_share_token?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
      };
      event_participants: {
        Row: {
          event_id: string;
          member_id: string;
          role: 'owner' | 'participant';
          can_edit: boolean;
          created_at: string;
        };
        Insert: {
          event_id: string;
          member_id: string;
          role?: 'owner' | 'participant';
          can_edit?: boolean;
          created_at?: string;
        };
        Update: {
          role?: 'owner' | 'participant';
          can_edit?: boolean;
        };
      };
      event_favorites: {
        Row: {
          member_id: string;
          event_id: string;
          created_at: string;
        };
        Insert: {
          member_id: string;
          event_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
      };
      events: {
        Row: {
          id: string;
          member_id: string;
          created_by: string;
          title: string;
          description: string | null;
          location: string | null;
          start_at: string;
          end_at: string;
          all_day: boolean;
          status: 'confirmed' | 'tentative' | 'cancelled';
          visibility: 'public' | 'private';
          recurrence_id: string | null;
          recurrence_exception_date: string | null;
          is_recurrence_root: boolean;
          external_event_id: string | null;
          external_provider: 'google' | 'microsoft' | null;
          sync_status: 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';
          sync_error: string | null;
          last_synced_at: string | null;
          color_override: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          created_by: string;
          title: string;
          description?: string | null;
          location?: string | null;
          start_at: string;
          end_at: string;
          all_day?: boolean;
          status?: 'confirmed' | 'tentative' | 'cancelled';
          visibility?: 'public' | 'private';
          recurrence_id?: string | null;
          recurrence_exception_date?: string | null;
          is_recurrence_root?: boolean;
          external_event_id?: string | null;
          external_provider?: 'google' | 'microsoft' | null;
          sync_status?: 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';
          sync_error?: string | null;
          last_synced_at?: string | null;
          color_override?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          title?: string;
          description?: string | null;
          location?: string | null;
          start_at?: string;
          end_at?: string;
          all_day?: boolean;
          status?: 'confirmed' | 'tentative' | 'cancelled';
          recurrence_id?: string | null;
          external_event_id?: string | null;
          external_provider?: 'google' | 'microsoft' | null;
          sync_status?: 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';
          sync_error?: string | null;
          last_synced_at?: string | null;
          color_override?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
      calendar_provider_accounts: {
        Row: {
          id: string;
          member_id: string;
          provider: 'google' | 'microsoft';
          provider_email: string;
          calendar_id: string;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
          ical_url: string | null;
          subscription_id: string | null;
          subscription_expiry: string | null;
          is_primary: boolean;
          sync_enabled: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          provider: 'google' | 'microsoft';
          provider_email: string;
          calendar_id: string;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          ical_url?: string | null;
          subscription_id?: string | null;
          subscription_expiry?: string | null;
          is_primary?: boolean;
          sync_enabled?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          provider?: 'google' | 'microsoft';
          provider_email?: string;
          calendar_id?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          token_expires_at?: string | null;
          ical_url?: string | null;
          subscription_id?: string | null;
          subscription_expiry?: string | null;
          is_primary?: boolean;
          sync_enabled?: boolean;
          metadata?: Json;
          updated_at?: string;
        };
      };
      conflicts: {
        Row: {
          id: string;
          member_id: string;
          event_id_a: string;
          event_id_b: string;
          overlap_start: string;
          overlap_end: string;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          event_id_a: string;
          event_id_b: string;
          overlap_start: string;
          overlap_end: string;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          event_id_a?: string;
          event_id_b?: string;
          overlap_start?: string;
          overlap_end?: string;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          actor_role: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          before_state: Json | null;
          after_state: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          actor_role: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: never;
      };
      notifications: {
        Row: {
          id: string;
          member_id: string;
          type: string;
          title: string;
          body: string | null;
          event_id: string | null;
          read: boolean;
          read_at: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          type: string;
          title: string;
          body?: string | null;
          event_id?: string | null;
          read?: boolean;
          read_at?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          type?: string;
          title?: string;
          body?: string | null;
          event_id?: string | null;
          read?: boolean;
          read_at?: string | null;
          metadata?: Json;
        };
      };
      event_sync_log: {
        Row: {
          id: string;
          event_id: string;
          member_id: string;
          operation: 'create' | 'update' | 'delete' | 'inbound';
          direction: 'outbound' | 'inbound';
          source: 'supabase' | 'google' | 'microsoft' | 'n8n';
          status: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count: number;
          n8n_execution_id: string | null;
          external_event_id: string | null;
          payload: Json | null;
          response: Json | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          member_id: string;
          operation: 'create' | 'update' | 'delete' | 'inbound';
          direction: 'outbound' | 'inbound';
          source: 'supabase' | 'google' | 'microsoft' | 'n8n';
          status: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count?: number;
          n8n_execution_id?: string | null;
          external_event_id?: string | null;
          payload?: Json | null;
          response?: Json | null;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          member_id?: string;
          operation?: 'create' | 'update' | 'delete' | 'inbound';
          direction?: 'outbound' | 'inbound';
          source?: 'supabase' | 'google' | 'microsoft' | 'n8n';
          status?: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count?: number;
          n8n_execution_id?: string | null;
          external_event_id?: string | null;
          payload?: Json | null;
          response?: Json | null;
          error_message?: string | null;
        };
      };
      recurrence_rules: {
        Row: {
          id: string;
          freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
          interval: number;
          by_day: string[] | null;
          by_month_day: number[] | null;
          by_month: number[] | null;
          count: number | null;
          until: string | null;
          rrule_string: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
          interval?: number;
          by_day?: string[] | null;
          by_month_day?: number[] | null;
          by_month?: number[] | null;
          count?: number | null;
          until?: string | null;
          rrule_string?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          freq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
          interval?: number;
          by_day?: string[] | null;
          by_month_day?: number[] | null;
          by_month?: number[] | null;
          count?: number | null;
          until?: string | null;
          rrule_string?: string | null;
        };
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          updated_at?: string;
        };
      };
      meeting_requests: {
        Row: {
          id: string;
          requester_id: string;
          target_partner_id: string;
          title: string;
          description: string | null;
          observations: string | null;
          proposed_start: string;
          proposed_end: string;
          duration_minutes: number;
          priority: 'low' | 'normal' | 'high' | 'urgent';
          status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'expired';
          reviewer_id: string | null;
          reviewed_at: string | null;
          decision_reason: string | null;
          suggested_start: string | null;
          suggested_end: string | null;
          suggested_at: string | null;
          resulting_event_id: string | null;
          detected_conflicts: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          target_partner_id: string;
          title: string;
          description?: string | null;
          observations?: string | null;
          proposed_start: string;
          proposed_end: string;
          priority?: 'low' | 'normal' | 'high' | 'urgent';
          status?: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'expired';
          reviewer_id?: string | null;
          reviewed_at?: string | null;
          decision_reason?: string | null;
          suggested_start?: string | null;
          suggested_end?: string | null;
          suggested_at?: string | null;
          resulting_event_id?: string | null;
          detected_conflicts?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          target_partner_id?: string;
          title?: string;
          description?: string | null;
          observations?: string | null;
          proposed_start?: string;
          proposed_end?: string;
          priority?: 'low' | 'normal' | 'high' | 'urgent';
          status?: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'expired';
          reviewer_id?: string | null;
          reviewed_at?: string | null;
          decision_reason?: string | null;
          suggested_start?: string | null;
          suggested_end?: string | null;
          suggested_at?: string | null;
          resulting_event_id?: string | null;
          detected_conflicts?: Json;
          metadata?: Json;
          updated_at?: string;
        };
      };
      meeting_request_participants: {
        Row: {
          id: string;
          meeting_request_id: string;
          member_id: string;
          optional: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_request_id: string;
          member_id: string;
          optional?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          meeting_request_id?: string;
          member_id?: string;
          optional?: boolean;
        };
      };
      meeting_request_events: {
        Row: {
          id: string;
          meeting_request_id: string;
          actor_id: string | null;
          action: 'created' | 'submitted' | 'viewed' | 'commented' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'reschedule_suggested' | 'reschedule_accepted' | 'reschedule_declined' | 'event_created' | 'completed';
          from_status: string | null;
          to_status: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_request_id: string;
          actor_id?: string | null;
          action: 'created' | 'submitted' | 'viewed' | 'commented' | 'approved' | 'rejected' | 'cancelled' | 'expired' | 'reschedule_suggested' | 'reschedule_accepted' | 'reschedule_declined' | 'event_created' | 'completed';
          from_status?: string | null;
          to_status?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: never;
      };
      meeting_request_comments: {
        Row: {
          id: string;
          meeting_request_id: string;
          author_id: string;
          body: string;
          visible_to_requester: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          meeting_request_id: string;
          author_id: string;
          body: string;
          visible_to_requester?: boolean;
          created_at?: string;
        };
        Update: never;
      };
      partner_office_hours: {
        Row: {
          id: string;
          partner_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          effective_from: string;
          effective_until: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          partner_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          effective_from?: string;
          effective_until?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          effective_from?: string;
          effective_until?: string | null;
          is_active?: boolean;
        };
      };
    };
    Views: {
      v_availability_busy_slots: {
        Row: {
          member_id: string | null;
          start_at: string | null;
          end_at: string | null;
          status: string | null;
          title_if_public: string | null;
        };
      };
    };
    Functions: {
      get_member_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      eqr_get_member_id: { Args: Record<never, never>; Returns: string; };
      eqr_is_admin: { Args: Record<never, never>; Returns: boolean; };
      eqr_get_member_role: { Args: Record<never, never>; Returns: string; };
      approve_meeting_request: {
        Args: { p_request_id: string; p_reviewer_id: string; p_decision_note?: string | null };
        Returns: string;
      };
      reject_meeting_request: {
        Args: { p_request_id: string; p_reviewer_id: string; p_reason: string };
        Returns: boolean;
      };
      create_meeting_request: {
        Args: {
          p_requester_id: string;
          p_target_partner_id: string;
          p_title: string;
          p_proposed_start: string;
          p_proposed_end: string;
          p_description?: string | null;
          p_observations?: string | null;
          p_priority?: string;
          p_participant_ids?: string[] | null;
        };
        Returns: string;
      };
      cancel_meeting_request: {
        Args: { p_request_id: string; p_requester_id: string };
        Returns: boolean;
      };
      public_create_meeting_request: {
        Args: {
          p_external_name: string;
          p_external_phone: string;
          p_target_partner_id: string;
          p_title: string;
          p_proposed_start: string;
          p_proposed_end: string;
          p_description?: string | null;
          p_observations?: string | null;
        };
        Returns: string;
      };
      public_get_partner_availability: {
        Args: { p_partner_id: string; p_from: string; p_to: string };
        Returns: { start_at: string; end_at: string }[];
      };
      public_list_partners: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          name: string;
          slug: string;
          color_hex: string;
          avatar_url: string | null;
          role: string;
        }[];
      };
      suggest_reschedule: {
        Args: { p_request_id: string; p_partner_id: string; p_new_start: string; p_new_end: string; p_message?: string | null };
        Returns: boolean;
      };
      detect_meeting_conflicts: {
        Args: { p_partner_id: string; p_start: string; p_end: string; p_exclude_event_id?: string | null };
        Returns: { event_id: string; title: string; start_at: string; end_at: string; overlap_min: number }[];
      };
    };
    Enums: Record<never, never>;
  };
}
