import { createBrowserClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase-config";

export { isSupabaseConfigured } from "@/lib/supabase-config";

export const supabase = isSupabaseConfigured
  ? createBrowserClient(
      supabaseUrl!,
      supabaseAnonKey!,
      {
        realtime: {
          params: {
            eventsPerSecond: 12,
          },
        },
      },
    )
  : null;
