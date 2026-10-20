import { supabase } from "@/services/supabase";
import type { GameMode } from "@/services/queues";

export interface DisplayPlayer {
  id: number;
  name: string;
}

export interface DisplayData {
  name: string;
  gameMode: GameMode;
  courtCount: number;
  courts: { courtNo: number; startedAt: string | null; team1: DisplayPlayer[]; team2: DisplayPlayer[] }[];
  // The next 3 matches waiting for a court; queuedCount is how many wait in total.
  upNext: { position: number; team1: DisplayPlayer[]; team2: DisplayPlayer[] }[];
  queuedCount: number;
}

// The JSON that get_display returns (snake_case, see the step 11 migration).
interface RawDisplay {
  name: string;
  game_mode: GameMode;
  court_count: number;
  courts: { court_no: number; started_at: string | null; team1: DisplayPlayer[]; team2: DisplayPlayer[] }[];
  up_next: { position: number; team1: DisplayPlayer[]; team2: DisplayPlayer[] }[];
  queued_count: number;
}

// Public display data. Works without a login: get_display is the only thing
// a visitor may call. Returns null when the queue doesn't exist.
export async function getDisplay(queueId: string): Promise<DisplayData | null> {
  const { data, error } = await supabase.rpc("get_display", { p_queue_id: queueId });
  // 22P02 = the link's queue id isn't a valid id at all: same as "not found".
  if (error?.code === "22P02") return null;
  if (error) throw error;
  if (!data) return null;

  const raw = data as unknown as RawDisplay;
  return {
    name: raw.name,
    gameMode: raw.game_mode,
    courtCount: raw.court_count,
    courts: raw.courts.map((court) => ({
      courtNo: court.court_no,
      startedAt: court.started_at,
      team1: court.team1,
      team2: court.team2,
    })),
    upNext: raw.up_next,
    queuedCount: raw.queued_count,
  };
}
