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
      audit_logs: {
        Row: {
          action: string
          changed_fields: string[] | null
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_lockouts: {
        Row: {
          blocked_until: string | null
          created_at: string
          email: string
          failed_count: number
          id: string
          ip_hash: string | null
          last_attempt_at: string
          recent_failures: number
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          email: string
          failed_count?: number
          id?: string
          ip_hash?: string | null
          last_attempt_at?: string
          recent_failures?: number
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          email?: string
          failed_count?: number
          id?: string
          ip_hash?: string | null
          last_attempt_at?: string
          recent_failures?: number
          updated_at?: string
        }
        Relationships: []
      }
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
      cron_runs: {
        Row: {
          created_at: string
          ended_at: string | null
          error_message: string | null
          id: string
          job_name: string
          metadata: Json | null
          run_id: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_name: string
          metadata?: Json | null
          run_id: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          id?: string
          job_name?: string
          metadata?: Json | null
          run_id?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      djen_proxy_config: {
        Row: {
          id: number
          last_error: string | null
          last_status: string | null
          proxy_url: string | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          id?: number
          last_error?: string | null
          last_status?: string | null
          proxy_url?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          id?: number
          last_error?: string | null
          last_status?: string | null
          proxy_url?: string | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
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
          base_legal: string | null
          classificacao_status:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2: Json | null
          classification_meta: Json | null
          confianca_classificacao: number | null
          content: string
          court: string | null
          created_at: string
          deadline: string | null
          deadline_canonical_v2: string | null
          deadline_sugerido_inseguro: Json | null
          external_id: string | null
          id: string
          peca_sugerida: Json | null
          process_id: string | null
          received_at: string
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2?: Json | null
          classification_meta?: Json | null
          confianca_classificacao?: number | null
          content: string
          court?: string | null
          created_at?: string
          deadline?: string | null
          deadline_canonical_v2?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string
          peca_sugerida?: Json | null
          process_id?: string | null
          received_at?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2?: Json | null
          classification_meta?: Json | null
          confianca_classificacao?: number | null
          content?: string
          court?: string | null
          created_at?: string
          deadline?: string | null
          deadline_canonical_v2?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string
          peca_sugerida?: Json | null
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
      intimations_backup_pre_prefix_fix: {
        Row: {
          base_legal: string | null
          classificacao_status:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          confianca_classificacao: number | null
          content: string | null
          court: string | null
          created_at: string | null
          deadline: string | null
          deadline_sugerido_inseguro: Json | null
          external_id: string | null
          id: string | null
          peca_sugerida: Json | null
          process_id: string | null
          received_at: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          confianca_classificacao?: number | null
          content?: string | null
          court?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string | null
          peca_sugerida?: Json | null
          process_id?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          confianca_classificacao?: number | null
          content?: string | null
          court?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string | null
          peca_sugerida?: Json | null
          process_id?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      intimations_backup_pre_user_consolidation: {
        Row: {
          base_legal: string | null
          classificacao_status:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2: Json | null
          classification_meta: Json | null
          confianca_classificacao: number | null
          content: string | null
          court: string | null
          created_at: string | null
          deadline: string | null
          deadline_canonical_v2: string | null
          deadline_sugerido_inseguro: Json | null
          external_id: string | null
          id: string | null
          peca_sugerida: Json | null
          process_id: string | null
          received_at: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2?: Json | null
          classification_meta?: Json | null
          confianca_classificacao?: number | null
          content?: string | null
          court?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_canonical_v2?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string | null
          peca_sugerida?: Json | null
          process_id?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          base_legal?: string | null
          classificacao_status?:
            | Database["public"]["Enums"]["intimation_classification_status"]
            | null
          classification_canonical_v2?: Json | null
          classification_meta?: Json | null
          confianca_classificacao?: number | null
          content?: string | null
          court?: string | null
          created_at?: string | null
          deadline?: string | null
          deadline_canonical_v2?: string | null
          deadline_sugerido_inseguro?: Json | null
          external_id?: string | null
          id?: string | null
          peca_sugerida?: Json | null
          process_id?: string | null
          received_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      ip_rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          ip_hash: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          ip_hash: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          ip_hash?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      judicial_suspensions: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string
          start_date: string
          tribunal_codigo: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason: string
          start_date: string
          tribunal_codigo?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string
          start_date?: string
          tribunal_codigo?: string | null
        }
        Relationships: []
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
      known_devices: {
        Row: {
          first_seen_at: string
          id: string
          ip_hash: string
          last_seen_at: string
          ua_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          ip_hash: string
          last_seen_at?: string
          ua_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          ip_hash?: string
          last_seen_at?: string
          ua_hash?: string
          user_agent?: string | null
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
          consecutive_failures: number
          created_at: string
          id: string
          last_error: string | null
          last_success_at: string | null
          last_sync_at: string | null
          lawyer_name: string | null
          name_match_threshold: number
          name_variations: string[]
          oab_number: string
          oab_uf: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          lawyer_name?: string | null
          name_match_threshold?: number
          name_variations?: string[]
          oab_number: string
          oab_uf: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          consecutive_failures?: number
          created_at?: string
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          lawyer_name?: string | null
          name_match_threshold?: number
          name_variations?: string[]
          oab_number?: string
          oab_uf?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      oab_sync_cursor: {
        Row: {
          id: string
          last_seen_disponibilizacao: string | null
          oab: string
          oab_settings_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_disponibilizacao?: string | null
          oab: string
          oab_settings_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen_disponibilizacao?: string | null
          oab?: string
          oab_settings_id?: string
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
      otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
        }
        Relationships: []
      }
      process_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          process_id: string | null
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          process_id?: string | null
          task_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          process_id?: string | null
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_comments_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
      sync_logs: {
        Row: {
          attempts: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          items_found: number | null
          items_inserted: number | null
          oab_number: string | null
          oab_settings_id: string | null
          oab_uf: string | null
          pages_fetched: number | null
          status: string
          triggered_by: string | null
          truncated: boolean
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_found?: number | null
          items_inserted?: number | null
          oab_number?: string | null
          oab_settings_id?: string | null
          oab_uf?: string | null
          pages_fetched?: number | null
          status: string
          triggered_by?: string | null
          truncated?: boolean
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_found?: number | null
          items_inserted?: number | null
          oab_number?: string | null
          oab_settings_id?: string | null
          oab_uf?: string | null
          pages_fetched?: number | null
          status?: string
          triggered_by?: string | null
          truncated?: boolean
          user_id?: string
        }
        Relationships: []
      }
      task_collaborators: {
        Row: {
          added_by: string
          can_edit: boolean
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          added_by: string
          can_edit?: boolean
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          added_by?: string
          can_edit?: boolean
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
          start_date: string | null
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
          start_date?: string | null
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
          start_date?: string | null
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
      tribunal_holidays: {
        Row: {
          created_at: string
          description: string
          holiday_date: string
          id: string
          tribunal_codigo: string
        }
        Insert: {
          created_at?: string
          description: string
          holiday_date: string
          id?: string
          tribunal_codigo: string
        }
        Update: {
          created_at?: string
          description?: string
          holiday_date?: string
          id?: string
          tribunal_codigo?: string
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
      _easter_sunday: { Args: { _year: number }; Returns: string }
      _is_business_day: {
        Args: { _d: string; _tribunal?: string }
        Returns: boolean
      }
      _next_business_day: {
        Args: { _d: string; _tribunal?: string }
        Returns: string
      }
      auth_user_exists_by_email: { Args: { _email: string }; Returns: boolean }
      calculate_deadline: {
        Args: {
          _days: number
          _start_date: string
          _tribunal?: string
          _unit?: string
        }
        Returns: string
      }
      can_delete: { Args: { _user_id: string }; Returns: boolean }
      can_edit_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_increment_rate_limit: {
        Args: {
          _endpoint: string
          _ip_hash: string
          _max: number
          _window_minutes: number
        }
        Returns: Json
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      exec_admin_sql: { Args: { sql_text: string }; Returns: Json }
      get_client_portal_data: { Args: { _token: string }; Returns: Json }
      get_portal_signatures: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_email_locked: { Args: { _email: string }; Returns: boolean }
      is_office_member: { Args: { _user_id: string }; Returns: boolean }
      log_auth_event: {
        Args: { _event: string; _metadata?: Json }
        Returns: undefined
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
      purge_client: { Args: { _client_id: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_intimation: {
        Args: { p_external_id: string; p_payload: Json; p_user_id: string }
        Returns: Json
      }
      register_device: {
        Args: { _ip_hash: string; _ua_hash: string; _user_agent?: string }
        Returns: Json
      }
      register_otp_failure: {
        Args: { _block_minutes?: number; _email: string; _max?: number }
        Returns: Json
      }
      release_cron_lock: { Args: { _job_name: string }; Returns: boolean }
      reset_mfa_grace: {
        Args: { _days?: number; target_user_id: string }
        Returns: Json
      }
      reset_otp_lockout: { Args: { _email: string }; Returns: undefined }
      sign_portal_document: {
        Args: {
          _request_id: string
          _signature_data_url: string
          _signer_name: string
          _token: string
        }
        Returns: Json
      }
      try_acquire_cron_lock: { Args: { _job_name: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "advogado"
        | "estagiario"
        | "financeiro"
        | "gerente"
        | "usuario"
        | "assistente_adm"
      intimation_classification_status:
        | "auto_alta"
        | "auto_media"
        | "auto_baixa"
        | "revisada_advogado"
        | "ambigua_urgente"
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
      app_role: [
        "admin",
        "advogado",
        "estagiario",
        "financeiro",
        "gerente",
        "usuario",
        "assistente_adm",
      ],
      intimation_classification_status: [
        "auto_alta",
        "auto_media",
        "auto_baixa",
        "revisada_advogado",
        "ambigua_urgente",
      ],
    },
  },
} as const
