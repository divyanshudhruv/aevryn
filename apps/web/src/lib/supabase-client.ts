import { getBrowserSupabase } from "@aevryn/auth";

/**
 * Shared browser Supabase client. Import from client components only.
 */
export const supabaseClient = getBrowserSupabase();