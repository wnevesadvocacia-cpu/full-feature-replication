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
      client_portal_tokens: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          expires_at: string | null
          id: string
          token: string
          user_id: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          token: string
          user_id: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          birth_date: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          marital_status: string | null
          name: string
          nationality: string | null
          occupation: string | null
          phone: string | null
          rg: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          marital_status?: string | null
          name: string
          nationality?: string | null
          occupation?: string | null
          phone?: string | null
          rg?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          marital_status?: string | null
          name?: string
          nationality?: string | null
          occupation?: string | null
          phone?: string | null
          rg?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_note: string | null
          content: string
          created_at: string
          document_id: string | null
          id: string
          template_id: string | null
          title: string
          user_id: string
          version_number: number
        }
        Insert: {
          change_note?: string | null
          content?: string
          created_at?: string
          document_id?: string | null
          id?: string
          template_id?: string | null
          title: string
          user_id: string
          version_number?: number
        }
        Update: {
          change_note?: string | null
          content?: string
          created_at?: string
          document_id?: string | null
          id?: string
          template_id?: string | null
          title?: string
          user_id?: string
          version_number?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string | null
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          mime_type: string | null
          name: string
          process_id: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mime_type?: string | null
          name: string
          process_id?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          process_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          client_id: string | null
          created_at: string
          date: string
          description: string
          id: string
          notes: string | null
          payment_method: string | null
          process_id: string | null
          reimbursable: boolean
          reimbursed: boolean
          supplier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string
          client_id?: string | null
          created_at?: string
          date?: string
          description: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          process_id?: string | null
          reimbursable?: boolean
          reimbursed?: boolean
          supplier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          process_id?: string | null
          reimbursable?: boolean
          reimbursed?: boolean
          supplier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fee_agreements: {
        Row: {
          client_id: string | null
          created_at: string
          fixed_amount: number | null
          hourly_rate: number | null
          id: string
          installments_count: number | null
          installments_paid: number
          notes: string | null
          process_id: string | null
          status: string
          success_percent: number | null
          total_estimated: number | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          fixed_amount?: number | null
          hourly_rate?: number | null
          id?: string
          installments_count?: number | null
          installments_paid?: number
          notes?: string | null
          process_id?: string | null
          status?: string
          success_percent?: number | null
          total_estimated?: number | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          fixed_amount?: number | null
          hourly_rate?: number | null
          id?: string
          installments_count?: number | null
          installments_paid?: number
          notes?: string | null
          process_id?: string | null
          status?: string
          success_percent?: number | null
          total_estimated?: number | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intimations: {
        Row: {
          content: string
          court: string | null
          created_at: string
          deadline: string | null
          external_id: string | null
          id: string
          process_id: string | null
          received_at: string
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          court?: string | null
          created_at?: string
          deadline?: string | null
          external_id?: string | null
          id?: string
          process_id?: string | null
          received_at?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          court?: string | null
          created_at?: string
          deadline?: string | null
          external_id?: string | null
          id?: string
          process_id?: string | null
          received_at?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intimations_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          number: string
          paid_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          number: string
          paid_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          number?: string
          paid_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          color: string
          created_at: string
          id: string
          position: number
          status_key: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          position?: number
          status_key: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          position?: number
          status_key?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          fatura_vencida: boolean
          id: string
          nova_tarefa: boolean
          novo_cliente: boolean
          tarefa_concluida: boolean
          updated_at: string
          user_id: string
          vencimento_processo: boolean
        }
        Insert: {
          created_at?: string
          fatura_vencida?: boolean
          id?: string
          nova_tarefa?: boolean
          novo_cliente?: boolean
          tarefa_concluida?: boolean
          updated_at?: string
          user_id: string
          vencimento_processo?: boolean
        }
        Update: {
          created_at?: string
          fatura_vencida?: boolean
          id?: string
          nova_tarefa?: boolean
          novo_cliente?: boolean
          tarefa_concluida?: boolean
          updated_at?: string
          user_id?: string
          vencimento_processo?: boolean
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      oab_settings: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_sync_at: string | null
          oab_number: string
          oab_uf: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          oab_number: string
          oab_uf: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_sync_at?: string | null
          oab_number?: string
          oab_uf?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      office_settings: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string | null
          site: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          site?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processes: {
        Row: {
          cause_value: number | null
          client_id: string | null
          client_name: string | null
          closing_date: string | null
          comarca: string | null
          contingency: number | null
          created_at: string
          due_date: string | null
          honorarios_percent: number | null
          honorarios_valor: number | null
          id: string
          last_update: string | null
          lawyer: string | null
          number: string
          observations: string | null
          opponent: string | null
          phase: string | null
          request_date: string | null
          responsible: string | null
          result: string | null
          stage: string | null
          status: string
          title: string
          tribunal: string | null
          type: string | null
          updated_at: string
          user_id: string
          value: number | null
          vara: string | null
        }
        Insert: {
          cause_value?: number | null
          client_id?: string | null
          client_name?: string | null
          closing_date?: string | null
          comarca?: string | null
          contingency?: number | null
          created_at?: string
          due_date?: string | null
          honorarios_percent?: number | null
          honorarios_valor?: number | null
          id?: string
          last_update?: string | null
          lawyer?: string | null
          number: string
          observations?: string | null
          opponent?: string | null
          phase?: string | null
          request_date?: string | null
          responsible?: string | null
          result?: string | null
          stage?: string | null
          status?: string
          title: string
          tribunal?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
          value?: number | null
          vara?: string | null
        }
        Update: {
          cause_value?: number | null
          client_id?: string | null
          client_name?: string | null
          closing_date?: string | null
          comarca?: string | null
          contingency?: number | null
          created_at?: string
          due_date?: string | null
          honorarios_percent?: number | null
          honorarios_valor?: number | null
          id?: string
          last_update?: string | null
          lawyer?: string | null
          number?: string
          observations?: string | null
          opponent?: string | null
          phase?: string | null
          request_date?: string | null
          responsible?: string | null
          result?: string | null
          stage?: string | null
          status?: string
          title?: string
          tribunal?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          value?: number | null
          vara?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_requests: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          document_id: string | null
          expires_at: string | null
          id: string
          signature_data_url: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_name: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          signature_data_url?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          expires_at?: string | null
          id?: string
          signature_data_url?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee: string | null
          completed: boolean
          created_at: string
          description: string | null
          due_date: string | null
          end_time: string | null
          event_type: string | null
          id: string
          location: string | null
          priority: string
          process_id: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          completed?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location?: string | null
          priority?: string
          process_id?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string | null
          completed?: boolean
          created_at?: string
          description?: string | null
          due_date?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          location?: string | null
          priority?: string
          process_id?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          client_id: string | null
          created_at: string
          date: string
          description: string | null
          hourly_rate: number | null
          hours: number
          id: string
          invoiced: boolean
          process_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          hourly_rate?: number | null
          hours?: number
          id?: string
          invoiced?: boolean
          process_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          client_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          hourly_rate?: number | null
          hours?: number
          id?: string
          invoiced?: boolean
          process_id?: string | null
          updated_at?: string
          user_id?: string
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
      can_delete: { Args: { _user_id: string }; Returns: boolean }
      get_client_portal_data: { Args: { _token: string }; Returns: Json }
      get_portal_signatures: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      sign_portal_document: {
        Args: {
          _request_id: string
          _signature_data_url: string
          _signer_name: string
          _token: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "advogado" | "estagiario" | "financeiro" | "gerente"
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
      app_role: ["admin", "advogado", "estagiario", "financeiro", "gerente"],
    },
  },
} as const
