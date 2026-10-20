import type { PairMemory } from "@/features/matchmaking/engine";
import { pairKey } from "@/features/matchmaking/engine";
import type { Player } from "@/services/players";
import type { Queue } from "@/services/queues";
import { supabase } from "@/services/supabase";
import type { Tables } from "@/types/database";

export type MatchPlayer = Tables<"match_players">;
export type MatchWithPlayers = Tables<"matches"> & { match_players: MatchPlayer[] };

export interface CreateMatchResult {
  status: "assigned" | "queued";
  courtNo: number | null;
  matchNo: number | null;
  queueLength: number;
}

// Everything the team picker needs, read fresh right before picking.
// The queue (with its version) is read FIRST: if anything changes after that,
// create_match sees a newer version and refuses, so we never save a pick that
// was based on old data.
export async function getMatchmakingSnapshot(queueId: string): Promise<{
  queue: Queue;
  players: Player[];
  memory: PairMemory;
  queuedCount: number;
}> {
  const { data: queue, error: queueError } = await supabase.from("queues").select("*").eq("id", queueId).single();
  if (queueError) throw queueError;

  const [playersResult, memoryResult, queuedResult] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("queue_id", queueId)
      .is("removed_at", null)
      .order("queue_position", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("pair_memory").select("*").eq("queue_id", queueId),
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("queue_id", queueId).eq("status", "queued"),
  ]);
  if (playersResult.error) throw playersResult.error;
  if (memoryResult.error) throw memoryResult.error;
  if (queuedResult.error) throw queuedResult.error;

  const memory: PairMemory = { pair: new Map(), partner: new Map(), opponent: new Map(), opponentCount: new Map() };
  for (const row of memoryResult.data) {
    const key = pairKey(row.player_a, row.player_b);
    memory[row.kind].set(key, row.last_match_no);
    if (row.kind === "opponent" && row.opponent_count > 0) memory.opponentCount.set(key, row.opponent_count);
  }

  return { queue, players: playersResult.data, memory, queuedCount: queuedResult.count ?? 0 };
}

// Saves a picked match: starts it on a free court, or adds it to Up Next.
export async function createMatch(input: {
  queueId: string;
  expectedVersion: number;
  team1: number[];
  team2: number[];
  balanceText: string;
  explanation: string;
}): Promise<CreateMatchResult> {
  const { data, error } = await supabase.rpc("create_match", {
    p_queue_id: input.queueId,
    p_expected_version: input.expectedVersion,
    p_team1: input.team1,
    p_team2: input.team2,
    p_balance_text: input.balanceText,
    p_explanation: input.explanation,
  });
  if (error) throw error;
  const result = data as { status: "assigned" | "queued"; court_no: number | null; match_no: number | null; queue_length: number };
  return { status: result.status, courtNo: result.court_no, matchNo: result.match_no, queueLength: result.queue_length };
}

export async function cancelQueuedMatch(queueId: string, matchId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_queued_match", { p_queue_id: queueId, p_match_id: matchId });
  if (error) throw error;
}

// "Finish Game". matchId = the match the organizer saw on that court, so a
// double tap can't finish the next match that just started there.
// Returns the old API's message, e.g. "Court is now available".
export async function finishGame(queueId: string, courtNo: number, matchId: string): Promise<string> {
  const { data, error } = await supabase.rpc("finish_game", { p_queue_id: queueId, p_court_no: courtNo, p_match_id: matchId });
  if (error) throw error;
  return (data as { message: string }).message;
}

// Clears courts, Up Next and the anti-repeat memory; match history is kept.
export async function resetMatchmaking(queueId: string, includePlayersOnBreak: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("reset_matchmaking", {
    p_queue_id: queueId,
    p_include_players_on_break: includePlayersOnBreak,
  });
  if (error) throw error;
  return (data as { message: string }).message;
}

// Matches on a court right now and matches waiting in Up Next, with their players.
export async function listActiveMatches(queueId: string): Promise<MatchWithPlayers[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*, match_players(*)")
    .eq("queue_id", queueId)
    .in("status", ["started", "queued"])
    .order("queue_order", { ascending: true, nullsFirst: true })
    .order("court_no", { ascending: true });
  if (error) throw error;
  return data as MatchWithPlayers[];
}
