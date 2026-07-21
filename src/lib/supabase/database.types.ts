export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      app_state: {
        Row: {
          id: string;
          payload: Json;
          updated_at: string;
        };
        Insert: {
          id: string;
          payload: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
