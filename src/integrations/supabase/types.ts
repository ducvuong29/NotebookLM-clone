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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          notebook_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notebook_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          notebook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: never
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: never
          metadata?: Json | null
        }
        Relationships: []
      }
      flowcharts: {
        Row: {
          created_at: string | null
          error_message: string | null
          generation_status: string
          id: string
          mermaid_code: string
          notebook_id: string
          source_id: string
          summary: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          generation_status?: string
          id?: string
          mermaid_code?: string
          notebook_id: string
          source_id: string
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          generation_status?: string
          id?: string
          mermaid_code?: string
          notebook_id?: string
          source_id?: string
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flowcharts_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flowcharts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      notebook_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          notebook_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          notebook_id: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          notebook_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_members_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      notebooks: {
        Row: {
          audio_overview_generation_status: string | null
          audio_overview_url: string | null
          audio_url_expires_at: string | null
          color: string | null
          created_at: string
          description: string | null
          example_questions: string[] | null
          generation_status: string | null
          icon: string | null
          id: string
          search_vector: unknown
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          audio_overview_generation_status?: string | null
          audio_overview_url?: string | null
          audio_url_expires_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          example_questions?: string[] | null
          generation_status?: string | null
          icon?: string | null
          id?: string
          search_vector?: unknown
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          audio_overview_generation_status?: string | null
          audio_overview_url?: string | null
          audio_url_expires_at?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          example_questions?: string[] | null
          generation_status?: string | null
          icon?: string | null
          id?: string
          search_vector?: unknown
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          extracted_text: string | null
          id: string
          notebook_id: string
          source_type: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          extracted_text?: string | null
          id?: string
          notebook_id: string
          source_type?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          extracted_text?: string | null
          id?: string
          notebook_id?: string
          source_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          content: string | null
          content_search: unknown
          created_at: string
          display_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          notebook_id: string
          processing_status: string | null
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
          updated_at: string
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          content?: string | null
          content_search?: unknown
          created_at?: string
          display_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          notebook_id: string
          processing_status?: string | null
          summary?: string | null
          title: string
          type: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          content?: string | null
          content_search?: unknown
          created_at?: string
          display_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          notebook_id?: string
          processing_status?: string | null
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["source_type"]
          updated_at?: string
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_admin_users: {
        Args: { page_num?: number; page_size?: number; search_query?: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_disabled: boolean
          last_sign_in_at: string
          role: string
          total_count: number
        }[]
      }
      get_notebook_role: { Args: { p_notebook_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_notebook_owner: {
        Args: { notebook_id_param: string }
        Returns: boolean
      }
      is_notebook_owner_for_document: {
        Args: { doc_metadata: Json }
        Returns: boolean
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      search_notebook_content: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          match_count: number
          match_rank: number
          notebook_color: string
          notebook_description: string
          notebook_icon: string
          notebook_id: string
          notebook_title: string
          notebook_updated_at: string
          notebook_visibility: string
          source_snippet: string
          source_title: string
        }[]
      }
      search_users: {
        Args: { limit_count?: number; search_query: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          id: string
        }[]
      }
    }
    Enums: {
      member_role: "owner" | "editor" | "viewer"
      source_type: "pdf" | "text" | "website" | "youtube" | "audio"
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
      member_role: ["owner", "editor", "viewer"],
      source_type: ["pdf", "text", "website", "youtube", "audio"],
    },
  },
} as const

