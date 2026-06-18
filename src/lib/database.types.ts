export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      workspaces: {
        Row: {
          id: string
          name: string
          icon: string
          color: string
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          icon?: string
          color?: string
          owner_id?: string
        }
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>
      }
      workspace_members: {
        Row: {
          id: string
          workspace_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member' | 'viewer'
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member' | 'viewer'
        }
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>
      }
      workspace_role_categories: {
        Row: {
          id: string
          workspace_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          color?: string
        }
        Update: Partial<Database['public']['Tables']['workspace_role_categories']['Insert']>
      }
      projects: {
        Row: {
          id: string
          workspace_id: string
          name: string
          type: 'general' | 'study_plan'
          color: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          type?: 'general' | 'study_plan'
          color?: string
        }
        Update: Partial<Database['public']['Tables']['projects']['Insert']> & { archived_at?: string | null }
      }
      board_columns: {
        Row: {
          id: string
          project_id: string
          name: string
          position: number
          is_completed: boolean
          archived_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          position?: number
          is_completed?: boolean
        }
        Update: Partial<Database['public']['Tables']['board_columns']['Insert']> & { archived_at?: string | null }
      }
      tasks: {
        Row: {
          id: string
          workspace_id: string
          project_id: string
          column_id: string
          title: string
          description: string | null
          priority: 'Low' | 'Medium' | 'High' | 'Critical'
          due_date: string | null
          start_date: string | null
          assignee_id: string | null
          assignee_role_id: string | null
          position: number
          created_by: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          project_id: string
          column_id: string
          title: string
          description?: string | null
          priority?: 'Low' | 'Medium' | 'High' | 'Critical'
          due_date?: string | null
          start_date?: string | null
          assignee_id?: string | null
          assignee_role_id?: string | null
          position?: number
          created_by?: string | null
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
      }
      tags: {
        Row: { id: string; workspace_id: string; name: string; color: string; created_at: string }
        Insert: { id?: string; workspace_id: string; name: string; color?: string }
        Update: Partial<Database['public']['Tables']['tags']['Insert']>
      }
      task_tags: {
        Row: { task_id: string; tag_id: string }
        Insert: { task_id: string; tag_id: string }
        Update: Partial<Database['public']['Tables']['task_tags']['Insert']>
      }
      checklist_items: {
        Row: { id: string; task_id: string; title: string; completed: boolean; position: number; created_at: string }
        Insert: { id?: string; task_id: string; title: string; completed?: boolean; position?: number }
        Update: Partial<Database['public']['Tables']['checklist_items']['Insert']>
      }
      learners: {
        Row: {
          id: string
          workspace_id: string
          name: string
          guardian_name: string | null
          grade: string | null
          created_at: string
        }
        Insert: { id?: string; workspace_id: string; name: string; guardian_name?: string | null; grade?: string | null }
        Update: Partial<Database['public']['Tables']['learners']['Insert']>
      }
      subjects: {
        Row: { id: string; workspace_id: string; name: string; color: string; created_at: string }
        Insert: { id?: string; workspace_id: string; name: string; color?: string }
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>
      }
      study_task_details: {
        Row: {
          task_id: string
          learner_id: string
          subject_id: string
          topic: string
          exercise_type: string
          estimated_minutes: number
          result_mark: number | null
          correction_required: boolean
          guardian_notes: string | null
        }
        Insert: {
          task_id: string
          learner_id: string
          subject_id: string
          topic: string
          exercise_type?: string
          estimated_minutes?: number
          result_mark?: number | null
          correction_required?: boolean
          guardian_notes?: string | null
        }
        Update: Partial<Database['public']['Tables']['study_task_details']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      workspace_role: 'owner' | 'admin' | 'member' | 'viewer'
      project_type: 'general' | 'study_plan'
      task_priority: 'Low' | 'Medium' | 'High' | 'Critical'
    }
    CompositeTypes: Record<string, never>
  }
}
