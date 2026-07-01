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
      bonos_catalogo: {
        Row: {
          duracion_min: number | null
          id: string
          nombre: string
          orden: number
          precio: number
          sesiones_incluidas: number
          tipo: Database["public"]["Enums"]["bono_tipo"]
        }
        Insert: {
          duracion_min?: number | null
          id?: string
          nombre: string
          orden?: number
          precio: number
          sesiones_incluidas: number
          tipo: Database["public"]["Enums"]["bono_tipo"]
        }
        Update: {
          duracion_min?: number | null
          id?: string
          nombre?: string
          orden?: number
          precio?: number
          sesiones_incluidas?: number
          tipo?: Database["public"]["Enums"]["bono_tipo"]
        }
        Relationships: []
      }
      client_bonos: {
        Row: {
          activo: boolean
          bono_catalogo_id: string | null
          client_id: string
          created_at: string
          fecha_inicio: string
          id: string
          sesiones_disponibles: number
          sesiones_realizadas: number
          ultimo_bono_fecha: string | null
          ultimo_bono_nombre: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          bono_catalogo_id?: string | null
          client_id: string
          created_at?: string
          fecha_inicio?: string
          id?: string
          sesiones_disponibles?: number
          sesiones_realizadas?: number
          ultimo_bono_fecha?: string | null
          ultimo_bono_nombre?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          bono_catalogo_id?: string | null
          client_id?: string
          created_at?: string
          fecha_inicio?: string
          id?: string
          sesiones_disponibles?: number
          sesiones_realizadas?: number
          ultimo_bono_fecha?: string | null
          ultimo_bono_nombre?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_bonos_bono_catalogo_id_fkey"
            columns: ["bono_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bonos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_bonos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          activo: boolean
          created_at: string
          cumpleanos: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cumpleanos?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          cumpleanos?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          bono_catalogo_id: string
          client_id: string
          cobrador_trainer_id: string | null
          created_at: string
          fecha: string
          id: string
          nota: string | null
          precio_cobrado: number
        }
        Insert: {
          bono_catalogo_id: string
          client_id: string
          cobrador_trainer_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          precio_cobrado: number
        }
        Update: {
          bono_catalogo_id?: string
          client_id?: string
          cobrador_trainer_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          precio_cobrado?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bono_catalogo_id_fkey"
            columns: ["bono_catalogo_id"]
            isOneToOne: false
            referencedRelation: "bonos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cobrador_trainer_id_fkey"
            columns: ["cobrador_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          client_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["sesion_estado"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          incidencia: string | null
          no_contabilizar: boolean
          ocupacion: number
          recurrencia_id: string | null
          tipo: Database["public"]["Enums"]["bono_tipo"] | null
          titulo: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["sesion_estado"]
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          incidencia?: string | null
          no_contabilizar?: boolean
          ocupacion?: number
          recurrencia_id?: string | null
          tipo?: Database["public"]["Enums"]["bono_tipo"] | null
          titulo?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["sesion_estado"]
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          incidencia?: string | null
          no_contabilizar?: boolean
          ocupacion?: number
          recurrencia_id?: string | null
          tipo?: Database["public"]["Enums"]["bono_tipo"] | null
          titulo?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          iniciales: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          iniciales: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          iniciales?: string
          nombre?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_invoice_row: {
        Args: { p_bono_cat: string; p_client: string; p_fecha: string }
        Returns: undefined
      }
      revert_invoice_row: {
        Args: { p_bono_cat: string; p_client: string; p_fecha: string }
        Returns: undefined
      }
      sync_client_fecha_inicio: {
        Args: { p_client: string }
        Returns: undefined
      }
    }
    Enums: {
      bono_tipo: "individual" | "pareja" | "grupal" | "prueba"
      sesion_estado:
        | "reservada"
        | "realizada"
        | "cancelada"
        | "prueba"
        | "renovacion"
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
      bono_tipo: ["individual", "pareja", "grupal", "prueba"],
      sesion_estado: [
        "reservada",
        "realizada",
        "cancelada",
        "prueba",
        "renovacion",
      ],
    },
  },
} as const
