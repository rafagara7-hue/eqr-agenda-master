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
          user_id: string;
          name: string;
          slug: string;
          color: string;
          color_hex: string;
          role: 'admin' | 'member';
          is_active: boolean;
          avatar_url: string | null;
          google_linked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          slug: string;
          color: string;
          color_hex: string;
          role?: 'admin' | 'member';
          is_active?: boolean;
          avatar_url?: string | null;
          google_linked?: boolean;
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
          role?: 'admin' | 'member';
          is_active?: boolean;
          avatar_url?: string | null;
          google_linked?: boolean;
          updated_at?: string;
        };
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
          google_event_id: string | null;
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
          google_event_id?: string | null;
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
          google_event_id?: string | null;
          sync_status?: 'pending' | 'synced' | 'failed' | 'conflict' | 'local_only';
          sync_error?: string | null;
          last_synced_at?: string | null;
          color_override?: string | null;
          metadata?: Json;
          updated_at?: string;
        };
      };
      google_calendar_accounts: {
        Row: {
          id: string;
          member_id: string;
          google_email: string;
          calendar_id: string;
          access_token: string;
          refresh_token: string;
          token_expires_at: string;
          webhook_channel_id: string | null;
          webhook_expiry: string | null;
          is_primary: boolean;
          sync_enabled: boolean;
          last_synced_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          google_email: string;
          calendar_id: string;
          access_token: string;
          refresh_token: string;
          token_expires_at: string;
          webhook_channel_id?: string | null;
          webhook_expiry?: string | null;
          is_primary?: boolean;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          member_id?: string;
          google_email?: string;
          calendar_id?: string;
          access_token?: string;
          refresh_token?: string;
          token_expires_at?: string;
          webhook_channel_id?: string | null;
          webhook_expiry?: string | null;
          is_primary?: boolean;
          sync_enabled?: boolean;
          last_synced_at?: string | null;
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
          source: 'supabase' | 'google' | 'n8n';
          status: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count: number;
          n8n_execution_id: string | null;
          google_event_id: string | null;
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
          source: 'supabase' | 'google' | 'n8n';
          status: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count?: number;
          n8n_execution_id?: string | null;
          google_event_id?: string | null;
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
          source?: 'supabase' | 'google' | 'n8n';
          status?: 'success' | 'failed' | 'pending' | 'retry';
          attempt_count?: number;
          n8n_execution_id?: string | null;
          google_event_id?: string | null;
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
    };
    Views: Record<never, never>;
    Functions: {
      get_member_id: {
        Args: Record<never, never>;
        Returns: string;
      };
      is_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
  };
}
