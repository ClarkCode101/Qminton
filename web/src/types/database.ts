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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ledger_entries: {
        Row: {
          amount: number
          created_at: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: number
          match_no: number | null
          note: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          player_id: number
          player_name: string
          queue_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          match_no?: number | null
          note: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          player_id: number
          player_name: string
          queue_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: never
          match_no?: number | null
          note?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          player_id?: number
          player_name?: string
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_queue_id_player_id_fkey"
            columns: ["queue_id", "player_id"]
            isOneToOne: false
            referencedRelation: "player_balances"
            referencedColumns: ["queue_id", "player_id"]
          },
          {
            foreignKeyName: "ledger_entries_queue_id_player_id_fkey"
            columns: ["queue_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["queue_id", "id"]
          },
        ]
      }
      match_players: {
        Row: {
          match_id: string
          player_id: number
          player_name: string
          player_skill: Database["public"]["Enums"]["skill_level"]
          queue_id: string
          slot: number
          team: number
        }
        Insert: {
          match_id: string
          player_id: number
          player_name: string
          player_skill: Database["public"]["Enums"]["skill_level"]
          queue_id: string
          slot: number
          team: number
        }
        Update: {
          match_id?: string
          player_id?: number
          player_name?: string
          player_skill?: Database["public"]["Enums"]["skill_level"]
          queue_id?: string
          slot?: number
          team?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_queue_id_match_id_fkey"
            columns: ["queue_id", "match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["queue_id", "id"]
          },
          {
            foreignKeyName: "match_players_queue_id_player_id_fkey"
            columns: ["queue_id", "player_id"]
            isOneToOne: false
            referencedRelation: "player_balances"
            referencedColumns: ["queue_id", "player_id"]
          },
          {
            foreignKeyName: "match_players_queue_id_player_id_fkey"
            columns: ["queue_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["queue_id", "id"]
          },
        ]
      }
      matches: {
        Row: {
          balance_text: string
          cancel_reason: string | null
          completed_at: string | null
          court_no: number | null
          created_at: string
          explanation: string
          id: string
          match_no: number | null
          queue_id: string
          queue_length: number
          queue_order: number | null
          resume_existing: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
        }
        Insert: {
          balance_text?: string
          cancel_reason?: string | null
          completed_at?: string | null
          court_no?: number | null
          created_at?: string
          explanation?: string
          id?: string
          match_no?: number | null
          queue_id: string
          queue_length?: number
          queue_order?: number | null
          resume_existing?: boolean
          started_at?: string | null
          status: Database["public"]["Enums"]["match_status"]
        }
        Update: {
          balance_text?: string
          cancel_reason?: string | null
          completed_at?: string | null
          court_no?: number | null
          created_at?: string
          explanation?: string
          id?: string
          match_no?: number | null
          queue_id?: string
          queue_length?: number
          queue_order?: number | null
          resume_existing?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
        }
        Relationships: [
          {
            foreignKeyName: "matches_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queue_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      pair_memory: {
        Row: {
          kind: Database["public"]["Enums"]["pair_kind"]
          last_match_no: number
          opponent_count: number
          player_a: number
          player_b: number
          queue_id: string
        }
        Insert: {
          kind: Database["public"]["Enums"]["pair_kind"]
          last_match_no: number
          opponent_count?: number
          player_a: number
          player_b: number
          queue_id: string
        }
        Update: {
          kind?: Database["public"]["Enums"]["pair_kind"]
          last_match_no?: number
          opponent_count?: number
          player_a?: number
          player_b?: number
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pair_memory_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queue_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_memory_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pair_memory_queue_id_player_a_fkey"
            columns: ["queue_id", "player_a"]
            isOneToOne: false
            referencedRelation: "player_balances"
            referencedColumns: ["queue_id", "player_id"]
          },
          {
            foreignKeyName: "pair_memory_queue_id_player_a_fkey"
            columns: ["queue_id", "player_a"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["queue_id", "id"]
          },
          {
            foreignKeyName: "pair_memory_queue_id_player_b_fkey"
            columns: ["queue_id", "player_b"]
            isOneToOne: false
            referencedRelation: "player_balances"
            referencedColumns: ["queue_id", "player_id"]
          },
          {
            foreignKeyName: "pair_memory_queue_id_player_b_fkey"
            columns: ["queue_id", "player_b"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["queue_id", "id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          games_played: number
          id: number
          is_paused: boolean
          is_playing: boolean
          is_waiting_match: boolean
          last_match_no: number
          name: string
          queue_id: string
          queue_position: number
          removed_at: string | null
          rest_games_needed: number
          skill: Database["public"]["Enums"]["skill_level"]
        }
        Insert: {
          created_at?: string
          games_played?: number
          id?: never
          is_paused?: boolean
          is_playing?: boolean
          is_waiting_match?: boolean
          last_match_no?: number
          name: string
          queue_id: string
          queue_position?: number
          removed_at?: string | null
          rest_games_needed?: number
          skill: Database["public"]["Enums"]["skill_level"]
        }
        Update: {
          created_at?: string
          games_played?: number
          id?: never
          is_paused?: boolean
          is_playing?: boolean
          is_waiting_match?: boolean
          last_match_no?: number
          name?: string
          queue_id?: string
          queue_position?: number
          removed_at?: string | null
          rest_games_needed?: number
          skill?: Database["public"]["Enums"]["skill_level"]
        }
        Relationships: [
          {
            foreignKeyName: "players_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queue_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          court_count: number
          court_fee: number
          created_at: string
          game_mode: Database["public"]["Enums"]["game_mode"]
          game_rate: number
          id: string
          match_no: number
          name: string
          owner_id: string
          updated_at: string
          version: number
        }
        Insert: {
          court_count?: number
          court_fee?: number
          created_at?: string
          game_mode?: Database["public"]["Enums"]["game_mode"]
          game_rate?: number
          id?: string
          match_no?: number
          name: string
          owner_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          court_count?: number
          court_fee?: number
          created_at?: string
          game_mode?: Database["public"]["Enums"]["game_mode"]
          game_rate?: number
          id?: string
          match_no?: number
          name?: string
          owner_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      player_balances: {
        Row: {
          balance: number | null
          billed_total: number | null
          name: string | null
          paid_total: number | null
          player_id: number | null
          queue_id: string | null
          removed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queue_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_summaries: {
        Row: {
          court_count: number | null
          court_fee: number | null
          created_at: string | null
          game_mode: Database["public"]["Enums"]["game_mode"] | null
          game_rate: number | null
          id: string | null
          name: string | null
          player_count: number | null
          total_billed: number | null
          total_collected: number | null
          updated_at: string | null
        }
        Insert: {
          court_count?: number | null
          court_fee?: number | null
          created_at?: string | null
          game_mode?: Database["public"]["Enums"]["game_mode"] | null
          game_rate?: number | null
          id?: string | null
          name?: string | null
          player_count?: never
          total_billed?: never
          total_collected?: never
          updated_at?: string | null
        }
        Update: {
          court_count?: number | null
          court_fee?: number | null
          created_at?: string | null
          game_mode?: Database["public"]["Enums"]["game_mode"] | null
          game_rate?: number | null
          id?: string | null
          name?: string | null
          player_count?: never
          total_billed?: never
          total_collected?: never
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_players: {
        Args: {
          p_players: Json
          p_queue_id: string
          p_skip_duplicates?: boolean
        }
        Returns: {
          created_at: string
          games_played: number
          id: number
          is_paused: boolean
          is_playing: boolean
          is_waiting_match: boolean
          last_match_no: number
          name: string
          queue_id: string
          queue_position: number
          removed_at: string | null
          rest_games_needed: number
          skill: Database["public"]["Enums"]["skill_level"]
        }[]
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cancel_queued_match: {
        Args: { p_match_id: string; p_queue_id: string }
        Returns: undefined
      }
      create_match: {
        Args: {
          p_balance_text: string
          p_expected_version: number
          p_explanation: string
          p_queue_id: string
          p_team1: number[]
          p_team2: number[]
        }
        Returns: Json
      }
      create_queue: {
        Args: {
          p_court_fee: number
          p_game_mode: Database["public"]["Enums"]["game_mode"]
          p_game_rate: number
          p_name: string
        }
        Returns: string
      }
      delete_queue: { Args: { p_queue_id: string }; Returns: undefined }
      finish_game: {
        Args: { p_court_no: number; p_match_id?: string; p_queue_id: string }
        Returns: Json
      }
      move_player_to_bottom: {
        Args: { p_player_id: number; p_queue_id: string }
        Returns: undefined
      }
      remove_player: {
        Args: { p_player_id: number; p_queue_id: string }
        Returns: undefined
      }
      reset_matchmaking: {
        Args: { p_include_players_on_break?: boolean; p_queue_id: string }
        Returns: Json
      }
      set_player_paused: {
        Args: { p_paused: boolean; p_player_id: number; p_queue_id: string }
        Returns: {
          created_at: string
          games_played: number
          id: number
          is_paused: boolean
          is_playing: boolean
          is_waiting_match: boolean
          last_match_no: number
          name: string
          queue_id: string
          queue_position: number
          removed_at: string | null
          rest_games_needed: number
          skill: Database["public"]["Enums"]["skill_level"]
        }
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_queue_settings: {
        Args: {
          p_court_count?: number
          p_court_fee?: number
          p_game_mode?: Database["public"]["Enums"]["game_mode"]
          p_game_rate?: number
          p_queue_id: string
        }
        Returns: {
          court_count: number
          court_fee: number
          created_at: string
          game_mode: Database["public"]["Enums"]["game_mode"]
          game_rate: number
          id: string
          match_no: number
          name: string
          owner_id: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "queues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      game_mode: "singles" | "doubles"
      ledger_entry_type: "court_fee" | "game_rate" | "adjustment" | "payment"
      match_status: "queued" | "started" | "completed" | "cancelled"
      pair_kind: "pair" | "partner" | "opponent"
      payment_method: "cash" | "gcash" | "maya" | "bank" | "other"
      skill_level: "beginner" | "intermediate" | "advance"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      game_mode: ["singles", "doubles"],
      ledger_entry_type: ["court_fee", "game_rate", "adjustment", "payment"],
      match_status: ["queued", "started", "completed", "cancelled"],
      pair_kind: ["pair", "partner", "opponent"],
      payment_method: ["cash", "gcash", "maya", "bank", "other"],
      skill_level: ["beginner", "intermediate", "advance"],
    },
  },
} as const
