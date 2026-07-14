import { hasSupabaseAuthConfiguration, isDemoMode } from "@/lib/env";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !isDemoMode() && hasSupabaseAuthConfiguration();
