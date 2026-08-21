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
    Functions: {
      /** Assembles the whole AppData document from the relational tables. */
      app_data_load: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      /** Current global revision, formatted like Date#toISOString. */
      app_data_revision: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      /** Optimistic-locked full replace. Pass null base to force the write. */
      app_data_save: {
        Args: { p_payload: Json; p_base_updated_at: string | null };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
