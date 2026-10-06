export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  aso: {
    Tables: {
      apps: {
        Row: {
          created_at: string
          default_country: string
          default_language: string
          icon_url: string | null
          id: string
          name: string
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_country: string
          default_language: string
          icon_url?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_country?: string
          default_language?: string
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apps_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      aso_events: {
        Row: {
          after_data: Json | null
          app_id: string
          before_data: Json | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_type: Database["aso"]["Enums"]["aso_event_type"]
          happened_at: string
          id: string
          platform: Database["aso"]["Enums"]["platform"] | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          after_data?: Json | null
          app_id: string
          before_data?: Json | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type: Database["aso"]["Enums"]["aso_event_type"]
          happened_at: string
          id?: string
          platform?: Database["aso"]["Enums"]["platform"] | null
          source?: string
          title: string
          updated_at?: string
        }
        Update: {
          after_data?: Json | null
          app_id?: string
          before_data?: Json | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_type?: Database["aso"]["Enums"]["aso_event_type"]
          happened_at?: string
          id?: string
          platform?: Database["aso"]["Enums"]["platform"] | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aso_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      collector_runs: {
        Row: {
          app_id: string
          details: NonNullable<Json>
          error_summary: string | null
          finished_at: string | null
          id: string
          items_failed: number
          items_skipped: number
          items_succeeded: number
          items_total: number
          job_type: string
          started_at: string
          status: Database["aso"]["Enums"]["collector_run_status"]
          trigger: string
          triggered_by: string | null
        }
        Insert: {
          app_id: string
          details?: NonNullable<Json>
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_skipped?: number
          items_succeeded?: number
          items_total?: number
          job_type: string
          started_at?: string
          status?: Database["aso"]["Enums"]["collector_run_status"]
          trigger: string
          triggered_by?: string | null
        }
        Update: {
          app_id?: string
          details?: NonNullable<Json>
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          items_failed?: number
          items_skipped?: number
          items_succeeded?: number
          items_total?: number
          job_type?: string
          started_at?: string
          status?: Database["aso"]["Enums"]["collector_run_status"]
          trigger?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collector_runs_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_snapshots: {
        Row: {
          captured_at: string
          competitor_id: string
          country: string
          description: string | null
          id: number
          metadata: NonNullable<Json>
          rating: number | null
          rating_count: number | null
          source: string
          subtitle: string | null
          title: string | null
          version: string | null
        }
        Insert: {
          captured_at?: string
          competitor_id: string
          country: string
          description?: string | null
          id?: never
          metadata?: NonNullable<Json>
          rating?: number | null
          rating_count?: number | null
          source: string
          subtitle?: string | null
          title?: string | null
          version?: string | null
        }
        Update: {
          captured_at?: string
          competitor_id?: string
          country?: string
          description?: string | null
          id?: never
          metadata?: NonNullable<Json>
          rating?: number | null
          rating_count?: number | null
          source?: string
          subtitle?: string | null
          title?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_snapshots_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          app_id: string
          competitor_external_id: string
          created_at: string
          developer_name: string | null
          icon_url: string | null
          id: string
          name: string
          platform: Database["aso"]["Enums"]["platform"]
          tracked: boolean
          updated_at: string
        }
        Insert: {
          app_id: string
          competitor_external_id: string
          created_at?: string
          developer_name?: string | null
          icon_url?: string | null
          id?: string
          name: string
          platform: Database["aso"]["Enums"]["platform"]
          tracked?: boolean
          updated_at?: string
        }
        Update: {
          app_id?: string
          competitor_external_id?: string
          created_at?: string
          developer_name?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          platform?: Database["aso"]["Enums"]["platform"]
          tracked?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_difficulty_history: {
        Row: {
          collector_run_id: string | null
          created_at: string
          details: NonNullable<Json>
          difficulty_score: number
          id: number
          keyword_id: string
          measured_at: string
          method: string
          sample_size: number
          source: string
        }
        Insert: {
          collector_run_id?: string | null
          created_at?: string
          details?: NonNullable<Json>
          difficulty_score: number
          id?: never
          keyword_id: string
          measured_at?: string
          method: string
          sample_size: number
          source: string
        }
        Update: {
          collector_run_id?: string | null
          created_at?: string
          details?: NonNullable<Json>
          difficulty_score?: number
          id?: never
          keyword_id?: string
          measured_at?: string
          method?: string
          sample_size?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_difficulty_history_collector_run_id_fkey"
            columns: ["collector_run_id"]
            isOneToOne: false
            referencedRelation: "collector_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_difficulty_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_difficulty_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_popularity_history: {
        Row: {
          created_at: string
          created_by: string | null
          details: NonNullable<Json>
          granularity: string
          id: number
          keyword_id: string
          measured_at: string
          period_end: string | null
          period_start: string | null
          popularity_score: number | null
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: NonNullable<Json>
          granularity: string
          id?: never
          keyword_id: string
          measured_at?: string
          period_end?: string | null
          period_start?: string | null
          popularity_score?: number | null
          source: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: NonNullable<Json>
          granularity?: string
          id?: never
          keyword_id?: string
          measured_at?: string
          period_end?: string | null
          period_start?: string | null
          popularity_score?: number | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_popularity_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_popularity_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_rank_history: {
        Row: {
          checked_at: string
          collector_run_id: string | null
          confidence: Database["aso"]["Enums"]["data_confidence"]
          created_at: string
          id: number
          keyword_id: string
          rank: number | null
          result_count: number | null
          search_depth: number
          source: string
        }
        Insert: {
          checked_at?: string
          collector_run_id?: string | null
          confidence: Database["aso"]["Enums"]["data_confidence"]
          created_at?: string
          id?: never
          keyword_id: string
          rank?: number | null
          result_count?: number | null
          search_depth: number
          source: string
        }
        Update: {
          checked_at?: string
          collector_run_id?: string | null
          confidence?: Database["aso"]["Enums"]["data_confidence"]
          created_at?: string
          id?: never
          keyword_id?: string
          rank?: number | null
          result_count?: number | null
          search_depth?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_rank_history_collector_run_id_fkey"
            columns: ["collector_run_id"]
            isOneToOne: false
            referencedRelation: "collector_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_rank_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keyword_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_rank_history_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          app_id: string
          country: string
          created_at: string
          created_by: string | null
          id: string
          is_priority: boolean
          keyword: string
          language: string
          notes: string | null
          platform: Database["aso"]["Enums"]["platform"]
          relevance_score: number | null
          tracked: boolean
          updated_at: string
        }
        Insert: {
          app_id: string
          country: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_priority?: boolean
          keyword: string
          language: string
          notes?: string | null
          platform: Database["aso"]["Enums"]["platform"]
          relevance_score?: number | null
          tracked?: boolean
          updated_at?: string
        }
        Update: {
          app_id?: string
          country?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_priority?: boolean
          keyword?: string
          language?: string
          notes?: string | null
          platform?: Database["aso"]["Enums"]["platform"]
          relevance_score?: number | null
          tracked?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keywords_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      metadata_snapshots: {
        Row: {
          captured_at: string
          captured_by: string | null
          description: string | null
          id: number
          keyword_field: string | null
          metadata: NonNullable<Json>
          source: string
          store_listing_id: string
          subtitle_or_short_description: string | null
          title: string | null
          version: string | null
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          description?: string | null
          id?: never
          keyword_field?: string | null
          metadata?: NonNullable<Json>
          source: string
          store_listing_id: string
          subtitle_or_short_description?: string | null
          title?: string | null
          version?: string | null
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          description?: string | null
          id?: never
          keyword_field?: string | null
          metadata?: NonNullable<Json>
          source?: string
          store_listing_id?: string
          subtitle_or_short_description?: string | null
          title?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metadata_snapshots_store_listing_id_fkey"
            columns: ["store_listing_id"]
            isOneToOne: false
            referencedRelation: "store_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      store_listings: {
        Row: {
          app_id: string
          country: string
          created_at: string
          description: string | null
          developer_name: string | null
          external_app_id: string
          id: string
          keyword_field: string | null
          language: string
          last_synced_at: string | null
          metadata: NonNullable<Json>
          metadata_source: string
          package_or_bundle_id: string | null
          platform: Database["aso"]["Enums"]["platform"]
          primary_category: string | null
          subtitle_or_short_description: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          app_id: string
          country: string
          created_at?: string
          description?: string | null
          developer_name?: string | null
          external_app_id: string
          id?: string
          keyword_field?: string | null
          language: string
          last_synced_at?: string | null
          metadata?: NonNullable<Json>
          metadata_source?: string
          package_or_bundle_id?: string | null
          platform: Database["aso"]["Enums"]["platform"]
          primary_category?: string | null
          subtitle_or_short_description?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string
          country?: string
          created_at?: string
          description?: string | null
          developer_name?: string | null
          external_app_id?: string
          id?: string
          keyword_field?: string | null
          language?: string
          last_synced_at?: string | null
          metadata?: NonNullable<Json>
          metadata_source?: string
          package_or_bundle_id?: string | null
          platform?: Database["aso"]["Enums"]["platform"]
          primary_category?: string | null
          subtitle_or_short_description?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_listings_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["aso"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["aso"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["aso"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      keyword_overview: {
        Row: {
          app_id: string | null
          country: string | null
          created_at: string | null
          difficulty_measured_at: string | null
          difficulty_method: string | null
          difficulty_score: number | null
          difficulty_source: string | null
          id: string | null
          is_priority: boolean | null
          keyword: string | null
          language: string | null
          latest_checked_at: string | null
          latest_rank: number | null
          latest_rank_confidence: Database["aso"]["Enums"]["data_confidence"] | null
          latest_rank_source: string | null
          latest_result_count: number | null
          latest_search_depth: number | null
          notes: string | null
          platform: Database["aso"]["Enums"]["platform"] | null
          popularity_details: Json | null
          popularity_granularity: string | null
          popularity_measured_at: string | null
          popularity_period_end: string | null
          popularity_period_start: string | null
          popularity_score: number | null
          popularity_source: string | null
          popularity_status: string | null
          previous_checked_at: string | null
          previous_rank: number | null
          previous_result_count: number | null
          previous_search_depth: number | null
          recent_ranks: Json | null
          relevance_score: number | null
          tracked: boolean | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keywords_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_read_app: { Args: { target_app_id: string }; Returns: boolean }
      can_read_keyword: { Args: { target_keyword_id: string }; Returns: boolean }
      can_write_app: { Args: { target_app_id: string }; Returns: boolean }
      can_write_keyword: { Args: { target_keyword_id: string }; Returns: boolean }
      create_workspace: {
        Args: { workspace_name: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_workspace_role: {
        Args: {
          allowed_roles: Database["aso"]["Enums"]["workspace_role"][]
          target_workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: { Args: { target_workspace_id: string }; Returns: boolean }
    }
    Enums: {
      aso_event_type:
        | "title_change"
        | "subtitle_change"
        | "keyword_change"
        | "description_change"
        | "screenshot_change"
        | "icon_change"
        | "release"
        | "custom"
      collector_run_status: "running" | "succeeded" | "partial" | "failed"
      data_confidence: "low" | "medium" | "high"
      platform: "ios" | "android"
      workspace_role: "owner" | "admin" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  aso: {
    Enums: {
      aso_event_type: [
        "title_change",
        "subtitle_change",
        "keyword_change",
        "description_change",
        "screenshot_change",
        "icon_change",
        "release",
        "custom",
      ],
      collector_run_status: ["running", "succeeded", "partial", "failed"],
      data_confidence: ["low", "medium", "high"],
      platform: ["ios", "android"],
      workspace_role: ["owner", "admin", "viewer"],
    },
  },
} as const
