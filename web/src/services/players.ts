import { supabase } from "@/services/supabase";
import type { Enums, Tables } from "@/types/database";

export type Player = Tables<"players">;
export type SkillLevel = Enums<"skill_level">;

export interface NewPlayer {
  name: string;
  skill: SkillLevel;
}

// Players still in the queue (not removed), in queue order.
export async function listPlayers(queueId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("queue_id", queueId)
    .is("removed_at", null)
    .order("queue_position", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data;
}

// What each player has been billed so far (court fee + game rates + adjustments).
// Includes removed players so their totals are still known.
export async function listPlayerBilledTotals(queueId: string): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("player_balances")
    .select("player_id, billed_total")
    .eq("queue_id", queueId);
  if (error) throw error;
  return new Map(data.map((row) => [row.player_id ?? 0, row.billed_total ?? 0]));
}

// Single add: a blank or duplicate name is an error ("Player already exists").
export async function addPlayer(queueId: string, player: NewPlayer): Promise<Player> {
  const { data, error } = await supabase.rpc("add_players", {
    p_queue_id: queueId,
    p_players: [{ name: player.name, skill: player.skill }],
    p_skip_duplicates: false,
  });
  if (error) throw error;
  return data[0];
}

// Bulk add: blank and duplicate names are skipped. Returns only the added players.
export async function bulkAddPlayers(queueId: string, players: NewPlayer[]): Promise<Player[]> {
  const { data, error } = await supabase.rpc("add_players", {
    p_queue_id: queueId,
    p_players: players.map((player) => ({ name: player.name, skill: player.skill })),
    p_skip_duplicates: true,
  });
  if (error) throw error;
  return data;
}

export async function removePlayer(queueId: string, playerId: number): Promise<void> {
  const { error } = await supabase.rpc("remove_player", { p_queue_id: queueId, p_player_id: playerId });
  if (error) throw error;
}

// paused = true -> "Take Break", false -> "Mark Ready".
export async function setPlayerPaused(queueId: string, playerId: number, paused: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_player_paused", {
    p_queue_id: queueId,
    p_player_id: playerId,
    p_paused: paused,
  });
  if (error) throw error;
}

export async function movePlayerToBottom(queueId: string, playerId: number): Promise<void> {
  const { error } = await supabase.rpc("move_player_to_bottom", { p_queue_id: queueId, p_player_id: playerId });
  if (error) throw error;
}
