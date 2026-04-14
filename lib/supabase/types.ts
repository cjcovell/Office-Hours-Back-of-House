// =============================================================================
// Hand-written Database type. Mirrors supabase/migrations/0001_init.sql.
// Once you have a real Supabase project, replace this with generated types:
//   pnpm db:types
// (which runs `supabase gen types typescript --local`).
// =============================================================================

export type GearStatus = "pending" | "active";
export type RoleType = "on_air" | "crew";
export type UserRole = "contributor" | "admin";

export type SocialLinks = {
  twitter?: string;
  mastodon?: string;
  bluesky?: string;
  instagram?: string;
  youtube?: string;
  website?: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          linked_contributor_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          linked_contributor_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      contributors: {
        Row: {
          id: string;
          name: string;
          slug: string;
          bio: string | null;
          headshot_url: string | null;
          social_links: SocialLinks;
          show_role: string;
          role_types: RoleType[];
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          bio?: string | null;
          headshot_url?: string | null;
          social_links?: SocialLinks;
          show_role: string;
          role_types?: RoleType[];
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contributors"]["Insert"]>;
        Relationships: [];
      };
      gear_items: {
        Row: {
          id: string;
          name: string;
          brand: string;
          model: string;
          category: string;
          description: string | null;
          image_url: string | null;
          asin: string | null;
          status: GearStatus;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          brand: string;
          model: string;
          category: string;
          description?: string | null;
          image_url?: string | null;
          asin?: string | null;
          status?: GearStatus;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["gear_items"]["Insert"]>;
        Relationships: [];
      };
      kit_entries: {
        Row: {
          id: string;
          contributor_id: string;
          gear_item_id: string;
          notes: string | null;
          category_override: string | null;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          contributor_id: string;
          gear_item_id: string;
          notes?: string | null;
          category_override?: string | null;
          display_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["kit_entries"]["Insert"]>;
        Relationships: [];
      };
      admin_notifications: {
        Row: {
          id: string;
          type: string;
          gear_item_id: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          type: string;
          gear_item_id: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["admin_notifications"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: {
      is_admin: { Args: { uid: string }; Returns: boolean };
    };
    Enums: {
      gear_status: GearStatus;
      role_type: RoleType;
      user_role: UserRole;
    };
    CompositeTypes: { [key: string]: never };
  };
}

// Convenience aliases used throughout the app.
export type ContributorRow = Database["public"]["Tables"]["contributors"]["Row"];
export type GearItemRow    = Database["public"]["Tables"]["gear_items"]["Row"];
export type KitEntryRow    = Database["public"]["Tables"]["kit_entries"]["Row"];
export type UserRow        = Database["public"]["Tables"]["users"]["Row"];
export type AdminNotificationRow =
  Database["public"]["Tables"]["admin_notifications"]["Row"];

export type KitEntryWithGear = KitEntryRow & { gear_items: GearItemRow };
export type ContributorWithKit = ContributorRow & {
  kit_entries: KitEntryWithGear[];
};
