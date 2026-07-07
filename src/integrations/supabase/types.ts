export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          details: Json
          id: string
          kind: string
          read_at: string | null
          request_id: string | null
          severity: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          read_at?: string | null
          request_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          read_at?: string | null
          request_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          id: string
          location_lat: number | null
          location_lng: number | null
          match_id: string
          note: string | null
          photo_url: string | null
          timestamp: string
          wait_time: number | null
        }
        Insert: {
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          match_id: string
          note?: string | null
          photo_url?: string | null
          timestamp?: string
          wait_time?: number | null
        }
        Update: {
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          match_id?: string
          note?: string | null
          photo_url?: string | null
          timestamp?: string
          wait_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checkins_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          approval_comment: string | null
          approved_at: string | null
          arrival_note: string | null
          arrival_time: string | null
          auto_canceled_at: string | null
          auto_confirmed: boolean
          completion_note: string | null
          confirm_deadline_at: string | null
          confirmed_at: string | null
          created_at: string
          dispute_reason: string | null
          disputed_at: string | null
          end_time: string | null
          id: string
          rating: number | null
          rejected_at: string | null
          request_id: string
          start_note: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["match_status"]
          worker_features: string | null
          worker_id: string
        }
        Insert: {
          approval_comment?: string | null
          approved_at?: string | null
          arrival_note?: string | null
          arrival_time?: string | null
          auto_canceled_at?: string | null
          auto_confirmed?: boolean
          completion_note?: string | null
          confirm_deadline_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          end_time?: string | null
          id?: string
          rating?: number | null
          rejected_at?: string | null
          request_id: string
          start_note?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          worker_features?: string | null
          worker_id: string
        }
        Update: {
          approval_comment?: string | null
          approved_at?: string | null
          arrival_note?: string | null
          arrival_time?: string | null
          auto_canceled_at?: string | null
          auto_confirmed?: boolean
          completion_note?: string | null
          confirm_deadline_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          dispute_reason?: string | null
          disputed_at?: string | null
          end_time?: string | null
          id?: string
          rating?: number | null
          rejected_at?: string | null
          request_id?: string
          start_note?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          worker_features?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          authorized_at: string | null
          captured_at: string | null
          created_at: string
          id: string
          kind: string
          platform_fee: number
          refund_amount: number
          request_id: string
          status: Database["public"]["Enums"]["payment_status"]
          stripe_client_secret: string | null
          stripe_payment_intent_id: string | null
          worker_payout: number
        }
        Insert: {
          amount: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          platform_fee?: number
          refund_amount?: number
          request_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_client_secret?: string | null
          stripe_payment_intent_id?: string | null
          worker_payout?: number
        }
        Update: {
          amount?: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          platform_fee?: number
          refund_amount?: number
          request_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_client_secret?: string | null
          stripe_payment_intent_id?: string | null
          worker_payout?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          id_photo_url: string | null
          name: string
          phone: string | null
          rating: number | null
          rating_count: number | null
          stripe_account_id: string | null
          stripe_account_ready: boolean | null
          terms_accepted_at: string | null
          verified: boolean | null
        }
        Insert: {
          created_at?: string
          id: string
          id_photo_url?: string | null
          name?: string
          phone?: string | null
          rating?: number | null
          rating_count?: number | null
          stripe_account_id?: string | null
          stripe_account_ready?: boolean | null
          terms_accepted_at?: string | null
          verified?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          id_photo_url?: string | null
          name?: string
          phone?: string | null
          rating?: number | null
          rating_count?: number | null
          stripe_account_id?: string | null
          stripe_account_ready?: boolean | null
          terms_accepted_at?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      requests: {
        Row: {
          actual_wait_minutes: number | null
          base_fee: number
          created_at: string
          customer_id: string
          desired_time: string | null
          estimated_wait_minutes: number | null
          extra_fee: number
          id: string
          is_peak: boolean
          landmark: string | null
          notes: string | null
          number_display_method: string | null
          peak_fee: number
          request_number: number | null
          status: Database["public"]["Enums"]["request_status"]
          store_address: string | null
          store_name: string
          time_fee: number
          total_fee: number
        }
        Insert: {
          actual_wait_minutes?: number | null
          base_fee?: number
          created_at?: string
          customer_id: string
          desired_time?: string | null
          estimated_wait_minutes?: number | null
          extra_fee?: number
          id?: string
          is_peak?: boolean
          landmark?: string | null
          notes?: string | null
          number_display_method?: string | null
          peak_fee?: number
          request_number?: number | null
          status?: Database["public"]["Enums"]["request_status"]
          store_address?: string | null
          store_name: string
          time_fee?: number
          total_fee?: number
        }
        Update: {
          actual_wait_minutes?: number | null
          base_fee?: number
          created_at?: string
          customer_id?: string
          desired_time?: string | null
          estimated_wait_minutes?: number | null
          extra_fee?: number
          id?: string
          is_peak?: boolean
          landmark?: string | null
          notes?: string | null
          number_display_method?: string | null
          peak_fee?: number
          request_number?: number | null
          status?: Database["public"]["Enums"]["request_status"]
          store_address?: string | null
          store_name?: string
          time_fee?: number
          total_fee?: number
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          event_id: string
          processed_at: string
          type: string
        }
        Insert: {
          event_id: string
          processed_at?: string
          type: string
        }
        Update: {
          event_id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notify_admin: {
        Args: {
          p_actor_id: string
          p_body: string
          p_details: Json
          p_kind: string
          p_request_id: string
          p_severity: string
          p_title: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "customer" | "worker" | "admin"
      match_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "arrived"
        | "in_progress"
        | "completed"
        | "canceled"
        | "awaiting_confirmation"
        | "disputed"
      payment_status:
        | "pending"
        | "paid"
        | "refunded"
        | "partially_refunded"
        | "failed"
        | "authorized"
        | "canceled"
      request_status:
        | "open"
        | "matched"
        | "arrived"
        | "in_progress"
        | "completed"
        | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "worker", "admin"],
      match_status: [
        "pending_approval",
        "approved",
        "rejected",
        "arrived",
        "in_progress",
        "completed",
        "canceled",
        "awaiting_confirmation",
        "disputed",
      ],
      payment_status: [
        "pending",
        "paid",
        "refunded",
        "partially_refunded",
        "failed",
        "authorized",
        "canceled",
      ],
      request_status: [
        "open",
        "matched",
        "arrived",
        "in_progress",
        "completed",
        "canceled",
      ],
    },
  },
} as const
