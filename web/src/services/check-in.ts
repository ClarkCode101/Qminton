import type { SkillLevel } from "@/services/players";
import type { GameMode } from "@/services/queues";
import { supabase } from "@/services/supabase";
import type { Tables } from "@/types/database";

// Player self check-in by QR (owner's addition). The QR holds a separate code
// (token), not the queue id, so the public display link can't add players.

export type CheckInSettings = Tables<"check_ins">;

export interface CheckInInfo {
  queueId: string;
  queueName: string;
  gameMode: GameMode;
  isOpen: boolean;
}

export interface CheckInResult {
  name: string;
  // Their spot in line, 1-based.
  position: number;
  queueId: string;
}

// Organizer: read the check-in settings (created, closed, the first time), and
// optionally open / close it or make a new code (old QR codes stop working).
export async function setCheckIn(
  queueId: string,
  change: { open?: boolean; newCode?: boolean } = {},
): Promise<CheckInSettings> {
  const { data, error } = await supabase.rpc("set_check_in", {
    p_queue_id: queueId,
    p_open: change.open,
    p_new_code: change.newCode ?? false,
  });
  if (error) throw error;
  return data;
}

// Public (no login): the queue behind a check-in code, or null if the code is unknown or replaced.
export async function getCheckIn(token: string): Promise<CheckInInfo | null> {
  const { data, error } = await supabase.rpc("get_check_in", { p_token: token });
  // 22P02 = not a valid code at all: same as "unknown".
  if (error?.code === "22P02") return null;
  if (error) throw error;
  if (!data) return null;
  const raw = data as { queue_id: string; queue_name: string; game_mode: GameMode; is_open: boolean };
  return { queueId: raw.queue_id, queueName: raw.queue_name, gameMode: raw.game_mode, isOpen: raw.is_open };
}

// Public (no login): a player adds themselves to the queue.
export async function checkIn(token: string, player: { name: string; skill: SkillLevel }): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc("check_in", { p_token: token, p_name: player.name, p_skill: player.skill });
  if (error) throw error;
  const raw = data as { name: string; position: number; queue_id: string };
  return { name: raw.name, position: raw.position, queueId: raw.queue_id };
}
