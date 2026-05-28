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
      match_results: {
        Row: {
          id: string
          room_id: string | null
          winner_team: string
          red_player_ids: string[]
          blue_player_ids: string[]
          red_nicknames: string[]
          blue_nicknames: string[]
          elo_changes: Json
          created_at: string
        }
        Insert: {
          id?: string
          room_id?: string | null
          winner_team: string
          red_player_ids?: string[]
          blue_player_ids?: string[]
          red_nicknames?: string[]
          blue_nicknames?: string[]
          elo_changes?: Json
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string | null
          winner_team?: string
          red_player_ids?: string[]
          blue_player_ids?: string[]
          red_nicknames?: string[]
          blue_nicknames?: string[]
          elo_changes?: Json
          created_at?: string
        }
        Relationships: []
      }
      move_suggestions: {
        Row: {
          id: string
          room_id: string
          from_player_id: string
          to_player_id: string
          col: number
          turn_index: number
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          from_player_id: string
          to_player_id: string
          col: number
          turn_index: number
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          from_player_id?: string
          to_player_id?: string
          col?: number
          turn_index?: number
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          nickname: string
          avatar_id: string
          elo: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nickname: string
          avatar_id?: string
          elo?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nickname?: string
          avatar_id?: string
          elo?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          player_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          player_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          player_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_state: {
        Row: {
          abandoned_player_ids: Json
          blue_time_left: number
          board: Json
          current_turn_index: number
          disconnect_deadline: string | null
          disconnected_player_id: string | null
          last_tick: string
          red_time_left: number
          room_id: string
          updated_at: string
          winner: string | null
          winning_cells: Json | null
        }
        Insert: {
          abandoned_player_ids?: Json
          blue_time_left?: number
          board: Json
          current_turn_index?: number
          disconnect_deadline?: string | null
          disconnected_player_id?: string | null
          last_tick?: string
          red_time_left?: number
          room_id: string
          updated_at?: string
          winner?: string | null
          winning_cells?: Json | null
        }
        Update: {
          abandoned_player_ids?: Json
          blue_time_left?: number
          board?: Json
          current_turn_index?: number
          disconnect_deadline?: string | null
          disconnected_player_id?: string | null
          last_tick?: string
          red_time_left?: number
          room_id?: string
          updated_at?: string
          winner?: string | null
          winning_cells?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "game_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          client_id: string
          connected: boolean
          created_at: string
          id: string
          nickname: string
          ready: boolean
          room_id: string
          slot_number: number
          team: string
        }
        Insert: {
          client_id: string
          connected?: boolean
          created_at?: string
          id?: string
          nickname: string
          ready?: boolean
          room_id: string
          slot_number: number
          team: string
        }
        Update: {
          client_id?: string
          connected?: boolean
          created_at?: string
          id?: string
          nickname?: string
          ready?: boolean
          room_id?: string
          slot_number?: number
          team?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          id: string
          status: string
          turn_order: Json
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          status?: string
          turn_order?: Json
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          status?: string
          turn_order?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
