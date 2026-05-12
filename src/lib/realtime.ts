import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export const sharedRealtimeTables = [
  "profiles",
  "patients",
  "knee_data_records",
  "alert_logs",
  "nursing_records",
  "ai_analyses",
  "appointments",
] as const;

export type SharedRealtimeTable = (typeof sharedRealtimeTables)[number];

export function subscribeToSharedTables(channelName: string, onChange: () => void, tables: readonly SharedRealtimeTable[] = sharedRealtimeTables, onStatus?: (status: string) => void) {
  if (!supabase) {
    return null;
  }

  let channel: RealtimeChannel = supabase.channel(channelName);

  for (const table of tables) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }

  return channel.subscribe(onStatus);
}

export function removeRealtimeChannel(channel: RealtimeChannel | null) {
  if (channel && supabase) {
    supabase.removeChannel(channel);
  }
}
