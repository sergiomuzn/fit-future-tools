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
          caducidad_dias: number | null
          caducidad_tipo: string | null
          centro_id: string
          duracion_min: number | null
          id: string
          modalidad: string | null
          nombre: string
          orden: number
          precio: number
          servicio_slug: string
          sesiones_incluidas: number
          tipo: string
        }
        Insert: {
          caducidad_dias?: number | null
          caducidad_tipo?: string | null
          centro_id?: string
          duracion_min?: number | null
          id?: string
          modalidad?: string | null
          nombre: string
          orden?: number
          precio: number
          servicio_slug?: string
          sesiones_incluidas: number
          tipo: string
        }
        Update: {
          caducidad_dias?: number | null
          caducidad_tipo?: string | null
          centro_id?: string
          duracion_min?: number | null
          id?: string
          modalidad?: string | null
          nombre?: string
          orden?: number
          precio?: number
          servicio_slug?: string
          sesiones_incluidas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonos_catalogo_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      center_config: {
        Row: {
          avisos: Json
          centro_id: string
          colores: Json
          horario_base: Json
          id: boolean
          nombre: string
          precios: Json
          updated_at: string
        }
        Insert: {
          avisos?: Json
          centro_id?: string
          colores?: Json
          horario_base?: Json
          id?: boolean
          nombre?: string
          precios?: Json
          updated_at?: string
        }
        Update: {
          avisos?: Json
          centro_id?: string
          colores?: Json
          horario_base?: Json
          id?: boolean
          nombre?: string
          precios?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_config_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: true
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      centros: {
        Row: {
          configuracion_json: Json
          created_at: string
          estado: string
          fecha_creacion: string
          id: string
          logo_url: string | null
          nombre: string
          plan: string
          updated_at: string
        }
        Insert: {
          configuracion_json?: Json
          created_at?: string
          estado?: string
          fecha_creacion?: string
          id?: string
          logo_url?: string | null
          nombre: string
          plan?: string
          updated_at?: string
        }
        Update: {
          configuracion_json?: Json
          created_at?: string
          estado?: string
          fecha_creacion?: string
          id?: string
          logo_url?: string | null
          nombre?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_bonos: {
        Row: {
          activo: boolean
          bono_catalogo_id: string | null
          caducidad_avisada: boolean
          centro_id: string
          client_id: string
          created_at: string
          fecha_caducidad: string | null
          fecha_inicio: string
          id: string
          modalidad: string | null
          nota: string | null
          servicio_slug: string
          sesiones_disponibles: number
          sesiones_realizadas: number
          tipo: string
          ultimo_bono_fecha: string | null
          ultimo_bono_nombre: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          bono_catalogo_id?: string | null
          caducidad_avisada?: boolean
          centro_id?: string
          client_id: string
          created_at?: string
          fecha_caducidad?: string | null
          fecha_inicio?: string
          id?: string
          modalidad?: string | null
          nota?: string | null
          servicio_slug: string
          sesiones_disponibles?: number
          sesiones_realizadas?: number
          tipo?: string
          ultimo_bono_fecha?: string | null
          ultimo_bono_nombre?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          bono_catalogo_id?: string | null
          caducidad_avisada?: boolean
          centro_id?: string
          client_id?: string
          created_at?: string
          fecha_caducidad?: string | null
          fecha_inicio?: string
          id?: string
          modalidad?: string | null
          nota?: string | null
          servicio_slug?: string
          sesiones_disponibles?: number
          sesiones_realizadas?: number
          tipo?: string
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
            foreignKeyName: "client_bonos_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
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
      client_events: {
        Row: {
          centro_id: string
          client_id: string
          created_at: string
          fecha: string
          id: string
          tipo: Database["public"]["Enums"]["client_event_tipo"]
        }
        Insert: {
          centro_id?: string
          client_id: string
          created_at?: string
          fecha?: string
          id?: string
          tipo: Database["public"]["Enums"]["client_event_tipo"]
        }
        Update: {
          centro_id?: string
          client_id?: string
          created_at?: string
          fecha?: string
          id?: string
          tipo?: Database["public"]["Enums"]["client_event_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "client_events_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          acceso: string
          centro_id: string
          client_id: string | null
          code: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          nombre: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          acceso?: string
          centro_id?: string
          client_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          nombre?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          acceso?: string
          centro_id?: string
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          nombre?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_profiles: {
        Row: {
          acceso: string
          activo: boolean
          bono_tipo: string
          centro_id: string
          client_id: string | null
          created_at: string
          email: string
          id: string
          invitation_id: string | null
          nombre: string
          updated_at: string
        }
        Insert: {
          acceso?: string
          activo?: boolean
          bono_tipo: string
          centro_id?: string
          client_id?: string | null
          created_at?: string
          email: string
          id: string
          invitation_id?: string | null
          nombre: string
          updated_at?: string
        }
        Update: {
          acceso?: string
          activo?: boolean
          bono_tipo?: string
          centro_id?: string
          client_id?: string | null
          created_at?: string
          email?: string
          id?: string
          invitation_id?: string | null
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_profiles_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_profiles_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "client_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          activo: boolean
          centro_id: string
          created_at: string
          cumpleanos: string | null
          email: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          notas: string | null
          sexo: string | null
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          centro_id?: string
          created_at?: string
          cumpleanos?: string | null
          email?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          notas?: string | null
          sexo?: string | null
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          centro_id?: string
          created_at?: string
          cumpleanos?: string | null
          email?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          sexo?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          centro_id: string
          client_id: string
          created_at: string
          group_id: string
        }
        Insert: {
          centro_id?: string
          client_id: string
          created_at?: string
          group_id: string
        }
        Update: {
          centro_id?: string
          client_id?: string
          created_at?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_schedules: {
        Row: {
          centro_id: string
          created_at: string
          dia_semana: number
          group_id: string
          hora_fin: string
          hora_inicio: string
          id: string
        }
        Insert: {
          centro_id?: string
          created_at?: string
          dia_semana: number
          group_id: string
          hora_fin: string
          hora_inicio: string
          id?: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          dia_semana?: number
          group_id?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_schedules_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_schedules_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          acceso_clientes: boolean
          activo: boolean
          capacidad: number
          centro_id: string
          created_at: string
          id: string
          nombre: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          acceso_clientes?: boolean
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          id?: string
          nombre: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          acceso_clientes?: boolean
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          id?: string
          nombre?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bono_catalogo_id: string | null
          centro_id: string
          client_id: string | null
          cobrador_trainer_id: string | null
          created_at: string
          fecha: string
          id: string
          nota: string | null
          precio_cobrado: number
          sesiones_override: number | null
        }
        Insert: {
          bono_catalogo_id?: string | null
          centro_id?: string
          client_id?: string | null
          cobrador_trainer_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          precio_cobrado: number
          sesiones_override?: number | null
        }
        Update: {
          bono_catalogo_id?: string | null
          centro_id?: string
          client_id?: string | null
          cobrador_trainer_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          nota?: string | null
          precio_cobrado?: number
          sesiones_override?: number | null
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
            foreignKeyName: "invoices_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
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
      modalidades: {
        Row: {
          centro_id: string
          created_at: string
          id: string
          nombre: string
          orden: number
          servicio_slug: string
          updated_at: string
        }
        Insert: {
          centro_id?: string
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          servicio_slug: string
          updated_at?: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          servicio_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modalidades_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          centro_id: string
          created_at: string
          id: string
          leida: boolean
          mensaje: string
          target_role: Database["public"]["Enums"]["app_role"] | null
          tipo: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          centro_id?: string
          created_at?: string
          id?: string
          leida?: boolean
          mensaje: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          tipo: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          centro_id?: string
          created_at?: string
          id?: string
          leida?: boolean
          mensaje?: string
          target_role?: Database["public"]["Enums"]["app_role"] | null
          tipo?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      service_slot_instances: {
        Row: {
          activo: boolean
          capacidad: number
          centro_id: string
          created_at: string
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          origen: string
          service_slot_id: string | null
          servicio_slug: string
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          origen?: string
          service_slot_id?: string | null
          servicio_slug: string
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          origen?: string
          service_slot_id?: string | null
          servicio_slug?: string
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_slot_instances_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_slot_instances_service_slot_id_fkey"
            columns: ["service_slot_id"]
            isOneToOne: false
            referencedRelation: "service_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_slot_instances_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_slots: {
        Row: {
          activo: boolean
          capacidad: number
          centro_id: string
          created_at: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          nota: string | null
          servicio_slug: string
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          nota?: string | null
          servicio_slug: string
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capacidad?: number
          centro_id?: string
          created_at?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          nota?: string | null
          servicio_slug?: string
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_slots_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_slots_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          abreviatura: string | null
          caducidad_dias: number | null
          caducidad_tipo: string | null
          capacidad_default: number
          centro_id: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          slug: string
          updated_at: string
        }
        Insert: {
          abreviatura?: string | null
          caducidad_dias?: number | null
          caducidad_tipo?: string | null
          capacidad_default?: number
          centro_id?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          slug: string
          updated_at?: string
        }
        Update: {
          abreviatura?: string | null
          caducidad_dias?: number | null
          caducidad_tipo?: string | null
          capacidad_default?: number
          centro_id?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          booked_by_user_id: string | null
          booking_tipo: string | null
          centro_id: string
          client_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["sesion_estado"]
          fecha: string
          group_id: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          incidencia: string | null
          modalidad: string | null
          no_contabilizar: boolean
          ocupacion: number
          por_confirmar: boolean
          recurrencia_id: string | null
          servicio_slug: string | null
          tipo: string | null
          titulo: string | null
          trainer_id: string | null
          updated_at: string
        }
        Insert: {
          booked_by_user_id?: string | null
          booking_tipo?: string | null
          centro_id?: string
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["sesion_estado"]
          fecha: string
          group_id?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          incidencia?: string | null
          modalidad?: string | null
          no_contabilizar?: boolean
          ocupacion?: number
          por_confirmar?: boolean
          recurrencia_id?: string | null
          servicio_slug?: string | null
          tipo?: string | null
          titulo?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Update: {
          booked_by_user_id?: string | null
          booking_tipo?: string | null
          centro_id?: string
          client_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["sesion_estado"]
          fecha?: string
          group_id?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          incidencia?: string | null
          modalidad?: string | null
          no_contabilizar?: boolean
          ocupacion?: number
          por_confirmar?: boolean
          recurrencia_id?: string | null
          servicio_slug?: string | null
          tipo?: string | null
          titulo?: string | null
          trainer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
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
      slot_structures: {
        Row: {
          centro_id: string
          created_at: string
          id: string
          nombre: string
          slots: Json
          updated_at: string
        }
        Insert: {
          centro_id?: string
          created_at?: string
          id?: string
          nombre: string
          slots?: Json
          updated_at?: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          id?: string
          nombre?: string
          slots?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_structures_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      special_days: {
        Row: {
          centro_id: string
          created_at: string
          etiqueta: string | null
          fecha: string
          hora_apertura: string | null
          hora_cierre: string | null
          tipo: Database["public"]["Enums"]["special_day_tipo"]
          updated_at: string
        }
        Insert: {
          centro_id?: string
          created_at?: string
          etiqueta?: string | null
          fecha: string
          hora_apertura?: string | null
          hora_cierre?: string | null
          tipo: Database["public"]["Enums"]["special_day_tipo"]
          updated_at?: string
        }
        Update: {
          centro_id?: string
          created_at?: string
          etiqueta?: string | null
          fecha?: string
          hora_apertura?: string | null
          hora_cierre?: string | null
          tipo?: Database["public"]["Enums"]["special_day_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_days_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmin_context: {
        Row: {
          centro_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          centro_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          centro_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "superadmin_context_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      superadmin_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      trainers: {
        Row: {
          activo: boolean
          centro_id: string
          created_at: string
          id: string
          iniciales: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          centro_id?: string
          created_at?: string
          id?: string
          iniciales: string
          nombre: string
        }
        Update: {
          activo?: boolean
          centro_id?: string
          created_at?: string
          id?: string
          iniciales?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainers_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          centro_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          centro_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          centro_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_invoice_row: {
        Args: {
          p_bono_cat: string
          p_client: string
          p_fecha: string
          p_sesiones_override?: number
        }
        Returns: undefined
      }
      auto_deactivate_prueba_clients: {
        Args: { p_dias?: number }
        Returns: number
      }
      claim_superadmin: { Args: never; Returns: boolean }
      create_centro: {
        Args: { p_nombre: string; p_plan?: string }
        Returns: string
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      ensure_prueba_bono: {
        Args: { p_client: string; p_fecha: string }
        Returns: undefined
      }
      get_aviso_umbral: { Args: never; Returns: number }
      get_center_nombre: { Args: never; Returns: string }
      get_my_centro_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_generic_pass_client: { Args: { _name: string }; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      my_centro_estado: { Args: never; Returns: string }
      notify_bonos_caducados: { Args: never; Returns: number }
      pick_bono_for_session: {
        Args: { p_client: string; p_for_restore?: boolean; p_servicio: string }
        Returns: string
      }
      revert_invoice_row: {
        Args: { p_bono_cat: string; p_client: string; p_fecha: string }
        Returns: undefined
      }
      session_servicio_slug:
        | {
            Args: {
              p_group_id: string
              p_ocupacion: number
              p_servicio: string
            }
            Returns: string
          }
        | {
            Args: {
              p_centro?: string
              p_group_id: string
              p_ocupacion: number
              p_servicio: string
            }
            Returns: string
          }
      superadmin_centro_usuarios: {
        Args: { p_centro: string }
        Returns: {
          alta: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          ultimo_acceso: string
          user_id: string
        }[]
      }
      superadmin_centros_overview: {
        Args: never
        Returns: {
          estado: string
          fecha_creacion: string
          id: string
          nombre: string
          plan: string
          sesiones_mes: number
          ultimo_acceso: string
          usuarios: number
        }[]
      }
      superadmin_global_stats: { Args: never; Returns: Json }
      superadmin_set_centro_estado: {
        Args: { p_centro: string; p_estado: string }
        Returns: undefined
      }
      superadmin_set_soporte: { Args: { p_centro: string }; Returns: undefined }
      sync_client_fecha_inicio: {
        Args: { p_client: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "entrenador" | "cliente" | "superadmin"
      bono_tipo: "individual" | "pareja" | "grupal" | "prueba" | "gympass"
      client_event_tipo: "alta" | "baja"
      sesion_estado:
        | "reservada"
        | "realizada"
        | "cancelada"
        | "prueba"
        | "renovacion"
      special_day_tipo: "cerrado" | "horario_especial"
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
      app_role: ["admin", "entrenador", "cliente", "superadmin"],
      bono_tipo: ["individual", "pareja", "grupal", "prueba", "gympass"],
      client_event_tipo: ["alta", "baja"],
      sesion_estado: [
        "reservada",
        "realizada",
        "cancelada",
        "prueba",
        "renovacion",
      ],
      special_day_tipo: ["cerrado", "horario_especial"],
    },
  },
} as const
