import { supabase } from "@/services/supabase";
import type { Enums, Tables } from "@/types/database";

export type GameMode = Enums<"game_mode">;
// "planned" = sign-ups before the games start; "live" = the queue is running.
export type QueueStatus = Enums<"queue_status">;

// One row of the landing page / navbar queue list.
export interface QueueSummary {
  id: string;
  name: string;
  gameMode: GameMode;
  courtFee: number;
  gameRate: number;
  courtCount: number;
  playerCount: number;
  totalBilled: number;
  // Payments actually received (old bug #8 showed totalBilled as "Collected").
  totalCollected: number;
  createdAt: string;
  updatedAt: string;
  status: QueueStatus;
  // Planned date and time (ISO), null when not planned.
  startsAt: string | null;
  // People still "going" on the sign-up list.
  signupCount: number;
}

export interface NewQueueInput {
  name: string;
  gameMode: GameMode;
  courtFee: number;
  gameRate: number;
}

export type Queue = Tables<"queues">;

// Views are typed as "every column may be null"; the real view never returns
// nulls for these columns, so we fill in safe defaults once, here.
function toQueueSummary(row: Tables<"queue_summaries">): QueueSummary {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    gameMode: row.game_mode ?? "doubles",
    courtFee: row.court_fee ?? 0,
    gameRate: row.game_rate ?? 0,
    courtCount: row.court_count ?? 2,
    playerCount: row.player_count ?? 0,
    totalBilled: row.total_billed ?? 0,
    totalCollected: row.total_collected ?? 0,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
    status: row.status ?? "live",
    startsAt: row.starts_at ?? null,
    signupCount: row.signup_count ?? 0,
  };
}

// The logged-in organizer's queues, most recently updated first.
// RLS makes sure nobody else's queues come back.
export async function listQueues(): Promise<QueueSummary[]> {
  const { data, error } = await supabase
    .from("queue_summaries")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map(toQueueSummary);
}

// Returns null when the queue doesn't exist or isn't yours (RLS hides it).
export async function getQueue(queueId: string): Promise<Queue | null> {
  const { data, error } = await supabase.from("queues").select("*").eq("id", queueId).maybeSingle();
  if (error) throw error;
  return data;
}

// Returns the new queue's id.
export async function createQueue(input: NewQueueInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_queue", {
    p_name: input.name,
    p_game_mode: input.gameMode,
    p_court_fee: input.courtFee,
    p_game_rate: input.gameRate,
  });
  if (error) throw error;
  return data;
}

export interface QueueSettingsUpdate {
  gameMode?: GameMode;
  courtFee?: number;
  gameRate?: number;
  courtCount?: number;
}

// Changes only the settings you pass. Shrinking the court count sends matches on
// removed courts back to the front of Up Next (see the step-6 migration).
export async function updateQueueSettings(queueId: string, settings: QueueSettingsUpdate): Promise<Queue> {
  const { data, error } = await supabase.rpc("update_queue_settings", {
    p_queue_id: queueId,
    p_game_mode: settings.gameMode,
    p_court_fee: settings.courtFee,
    p_game_rate: settings.gameRate,
    p_court_count: settings.courtCount,
  });
  if (error) throw error;
  return data;
}

export async function deleteQueue(queueId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_queue", { p_queue_id: queueId });
  if (error) throw error;
}
