export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage_log: {
        Row: {
          created_at: string
          estimated_cost_usd: number
          feature: string
          id: string
          model: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number
          feature: string
          id?: string
          model?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number
          feature?: string
          id?: string
          model?: string | null
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          base_amount_cents: number
          category_id: string
          created_at: string
          id: string
          month: string
          rollover_amount_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_amount_cents: number
          category_id: string
          created_at?: string
          id?: string
          month: string
          rollover_amount_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_amount_cents?: number
          category_id?: string
          created_at?: string
          id?: string
          month?: string
          rollover_amount_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_system: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          color: string
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      group_expense_item_assignments: {
        Row: {
          item_id: string
          user_id: string
        }
        Insert: {
          item_id: string
          user_id: string
        }
        Update: {
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_expense_item_assignments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "group_expense_items"
            referencedColumns: ["id"]
          },
        ]
      }
      group_expense_items: {
        Row: {
          group_expense_id: string
          id: string
          item_name: string
          position: number
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          group_expense_id: string
          id?: string
          item_name: string
          position?: number
          quantity?: number
          unit_price_cents: number
        }
        Update: {
          group_expense_id?: string
          id?: string
          item_name?: string
          position?: number
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_expense_items_group_expense_id_fkey"
            columns: ["group_expense_id"]
            isOneToOne: false
            referencedRelation: "group_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      group_expense_shares: {
        Row: {
          computed_share_cents: number | null
          exact_amount_cents: number | null
          group_expense_id: string
          id: string
          user_id: string
          weight: number | null
        }
        Insert: {
          computed_share_cents?: number | null
          exact_amount_cents?: number | null
          group_expense_id: string
          id?: string
          user_id: string
          weight?: number | null
        }
        Update: {
          computed_share_cents?: number | null
          exact_amount_cents?: number | null
          group_expense_id?: string
          id?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_expense_shares_group_expense_id_fkey"
            columns: ["group_expense_id"]
            isOneToOne: false
            referencedRelation: "group_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      group_expenses: {
        Row: {
          confirmed_at: string | null
          created_at: string
          description: string
          discount_amount_cents: number
          group_id: string
          id: string
          occurred_on: string
          paid_by: string
          receipt_image_path: string | null
          reopened_until: string | null
          split_mode: string
          status: string
          tax_allocation: string
          tax_amount_cents: number
          tip_allocation: string
          tip_amount_cents: number
          total_amount_cents: number
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          description: string
          discount_amount_cents?: number
          group_id: string
          id?: string
          occurred_on?: string
          paid_by: string
          receipt_image_path?: string | null
          reopened_until?: string | null
          split_mode: string
          status?: string
          tax_allocation?: string
          tax_amount_cents?: number
          tip_allocation?: string
          tip_amount_cents?: number
          total_amount_cents: number
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          description?: string
          discount_amount_cents?: number
          group_id?: string
          id?: string
          occurred_on?: string
          paid_by?: string
          receipt_image_path?: string | null
          reopened_until?: string | null
          split_mode?: string
          status?: string
          tax_allocation?: string
          tax_amount_cents?: number
          tip_allocation?: string
          tip_amount_cents?: number
          total_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          group_id: string
          id: string
          invited_by: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          group_id: string
          id?: string
          invited_by: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          group_id?: string
          id?: string
          invited_by?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_format: string
          default_currency: string
          default_payment_method: string
          full_name: string | null
          id: string
          notify_email_digest: boolean
          notify_push: boolean
          notify_settlement_reminders: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_currency?: string
          default_payment_method?: string
          full_name?: string | null
          id: string
          notify_email_digest?: boolean
          notify_push?: boolean
          notify_settlement_reminders?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_format?: string
          default_currency?: string
          default_payment_method?: string
          full_name?: string | null
          id?: string
          notify_email_digest?: boolean
          notify_push?: boolean
          notify_settlement_reminders?: boolean
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          active: boolean
          amount_cents: number
          category_id: string | null
          created_at: string
          description: string
          frequency: string
          id: string
          next_run_on: string
          payment_method: string | null
          type: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          category_id?: string | null
          created_at?: string
          description: string
          frequency: string
          id?: string
          next_run_on: string
          payment_method?: string | null
          type: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          description?: string
          frequency?: string
          id?: string
          next_run_on?: string
          payment_method?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount_cents: number
          created_at: string
          from_user_id: string
          group_id: string
          id: string
          note: string | null
          related_expense_ids: string[]
          settled_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          from_user_id: string
          group_id: string
          id?: string
          note?: string | null
          related_expense_ids?: string[]
          settled_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          from_user_id?: string
          group_id?: string
          id?: string
          note?: string | null
          related_expense_ids?: string[]
          settled_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          ai_category_confidence: number | null
          amount_cents: number
          category_id: string | null
          created_at: string
          description: string
          id: string
          is_recurring: boolean
          occurred_on: string
          payment_method: string | null
          receipt_image_path: string | null
          recurring_rule_id: string | null
          source_group_expense_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_category_confidence?: number | null
          amount_cents: number
          category_id?: string | null
          created_at?: string
          description: string
          id?: string
          is_recurring?: boolean
          occurred_on?: string
          payment_method?: string | null
          receipt_image_path?: string | null
          recurring_rule_id?: string | null
          source_group_expense_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_category_confidence?: number | null
          amount_cents?: number
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          is_recurring?: boolean
          occurred_on?: string
          payment_method?: string | null
          receipt_image_path?: string | null
          recurring_rule_id?: string | null
          source_group_expense_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_group_expense_id_fkey"
            columns: ["source_group_expense_id"]
            isOneToOne: false
            referencedRelation: "group_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_group_invite: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_group_expense: {
        Args: { p_expense_id: string; p_shares: Json }
        Returns: {
          confirmed_at: string | null
          created_at: string
          description: string
          discount_amount_cents: number
          group_id: string
          id: string
          occurred_on: string
          paid_by: string
          receipt_image_path: string | null
          reopened_until: string | null
          split_mode: string
          status: string
          tax_allocation: string
          tax_amount_cents: number
          tip_allocation: string
          tip_amount_cents: number
          total_amount_cents: number
        }
        SetofOptions: {
          from: "*"
          to: "group_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          group_name: string
          invited_by_name: string
          status: string
        }[]
      }
      is_expense_group_member: {
        Args: { p_group_expense_id: string }
        Returns: boolean
      }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      is_item_group_member: { Args: { p_item_id: string }; Returns: boolean }
      reopen_group_expense: {
        Args: { p_expense_id: string }
        Returns: {
          confirmed_at: string | null
          created_at: string
          description: string
          discount_amount_cents: number
          group_id: string
          id: string
          occurred_on: string
          paid_by: string
          receipt_image_path: string | null
          reopened_until: string | null
          split_mode: string
          status: string
          tax_allocation: string
          tax_amount_cents: number
          tip_allocation: string
          tip_amount_cents: number
          total_amount_cents: number
        }
        SetofOptions: {
          from: "*"
          to: "group_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

