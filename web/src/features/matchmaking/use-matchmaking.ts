import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { pickMatch, type EnginePlayer } from "@/features/matchmaking/engine";
import { buildMatchToastMessage } from "@/features/matchmaking/match-view";
import { queueKeys } from "@/features/queues/use-queues";
import { useToast } from "@/hooks/use-toast";
import { toUserMessage } from "@/services/errors";
import {
  cancelQueuedMatch,
  createMatch,
  finishGame,
  getMatchmakingSnapshot,
  listActiveMatches,
  listMatchHistory,
  resetMatchmaking,
  type CreateMatchResult,
  type MatchWithPlayers,
} from "@/services/matches";
import type { Player } from "@/services/players";

// Both keys start with ["queues", queueId], so any change to the queue
// (which invalidates queueKeys.detail) also refreshes them.
//
// Speed: each action shows its result as soon as the database has saved it,
// and the screen reloads in the background (it used to wait for the reload).
export const matchKeys = {
  active: (queueId: string) => ["queues", queueId, "matches"] as const,
  history: (queueId: string) => ["queues", queueId, "history"] as const,
};

const VERSION_CONFLICT = "This queue was changed on another device. Please try again.";

function toEnginePlayer(player: Player): EnginePlayer {
  return {
    id: player.id,
    name: player.name,
    skill: player.skill,
    queuePosition: player.queue_position,
    gamesPlayed: player.games_played,
    isPlaying: player.is_playing,
    isWaitingMatch: player.is_waiting_match,
    isPaused: player.is_paused,
    restGamesNeeded: player.rest_games_needed,
  };
}

// Reloads this queue's data (and the landing page list) without waiting for it.
function reloadQueue(queryClient: QueryClient, queueId: string) {
  void queryClient.invalidateQueries({ queryKey: queueKeys.detail(queueId) });
  void queryClient.invalidateQueries({ queryKey: queueKeys.list, exact: true });
}

export function useActiveMatches(queueId: string) {
  return useQuery({ queryKey: matchKeys.active(queueId), queryFn: () => listActiveMatches(queueId) });
}

// The newest 12 Match Log entries (old overlay limit) + the total for the button.
export function useMatchHistory(queueId: string) {
  return useQuery({ queryKey: matchKeys.history(queueId), queryFn: () => listMatchHistory(queueId, 12) });
}

// "Start Next Match" / "Queue Next Match":
//   1. read fresh data, 2. pick teams in the browser, 3. save with create_match.
// If another device changed the queue in between, the database refuses the
// stale pick; we then read again and pick again once before giving up.
export function useStartNextMatch(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async () => {
      for (let attempt = 0; ; attempt += 1) {
        const snapshot = await getMatchmakingSnapshot(queueId);
        const pick = pickMatch({
          mode: snapshot.queue.game_mode,
          players: snapshot.players.map(toEnginePlayer),
          currentMatchNo: snapshot.queue.match_no,
          hasPendingMatches: snapshot.queuedCount > 0,
          memory: snapshot.memory,
          rng: Math.random,
        });
        if (!pick.ok) {
          // Same shape as database errors, so the toast shows the message.
          throw { code: "P0001", message: pick.message };
        }

        try {
          const result = await createMatch({
            queueId,
            expectedVersion: snapshot.queue.version,
            team1: pick.team1.map((player) => player.id),
            team2: pick.team2.map((player) => player.id),
            balanceText: pick.balanceText,
            explanation: pick.explanation,
          });
          return { result, pick, mode: snapshot.queue.game_mode };
        } catch (error) {
          const isConflict = typeof error === "object" && error !== null && "message" in error && error.message === VERSION_CONFLICT;
          if (!isConflict || attempt >= 1) throw error;
        }
      }
    },
    onSuccess: ({ result, pick, mode }) => {
      showToast(buildMatchToastMessage(mode, result, pick.team1, pick.team2, pick.balanceText), "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Failed to create match"), "error");
    },
  });
}

interface AutoMade {
  result: CreateMatchResult;
  team1: EnginePlayer[];
  team2: EnginePlayer[];
  balanceText: string;
}

// Auto-start (owner's addition, 2026-10-21): fill every free court with a new
// match, then keep ONE match ready in Up Next (owner chose "always 1"; more
// would lock players in early and the picker would have fewer to choose from).
// Same picker and rules as "Start Next Match". Each round reads a fresh
// snapshot, and create_match refuses a stale one (version check). It stops
// when Up Next already has a match (Finish Game starts it on the court), when
// it has just queued one, or when the picker can't make a match. The reason is
// returned only when a court sits free; not being able to queue ahead is normal.
async function fillFreeCourts(queueId: string) {
  const made: AutoMade[] = [];
  let mode: "singles" | "doubles" = "doubles";
  // At most 6 courts + 1 Up Next match.
  for (let round = 0; round < 7; round += 1) {
    for (let attempt = 0; ; attempt += 1) {
      const snapshot = await getMatchmakingSnapshot(queueId);
      mode = snapshot.queue.game_mode;
      const freeCourts = snapshot.queue.court_count - snapshot.startedCount;
      if (snapshot.queuedCount > 0) return { made, mode, stopReason: null };

      const pick = pickMatch({
        mode,
        players: snapshot.players.map(toEnginePlayer),
        currentMatchNo: snapshot.queue.match_no,
        hasPendingMatches: false,
        memory: snapshot.memory,
        rng: Math.random,
      });
      if (!pick.ok) return { made, mode, stopReason: freeCourts > 0 ? pick.message : null };

      try {
        const result = await createMatch({
          queueId,
          expectedVersion: snapshot.queue.version,
          team1: pick.team1.map((player) => player.id),
          team2: pick.team2.map((player) => player.id),
          balanceText: pick.balanceText,
          explanation: pick.explanation,
        });
        made.push({ result, team1: pick.team1, team2: pick.team2, balanceText: pick.balanceText });
        // All courts were busy, so this one went to Up Next: done.
        if (result.status === "queued") return { made, mode, stopReason: null };
        break;
      } catch (error) {
        const isConflict = typeof error === "object" && error !== null && "message" in error && error.message === VERSION_CONFLICT;
        if (!isConflict || attempt >= 1) throw error;
      }
    }
  }
  return { made, mode, stopReason: null };
}

export function useAutoFillCourts(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: () => fillFreeCourts(queueId),
    onSuccess: ({ made, mode, stopReason }) => {
      if (made.length === 1) {
        const [match] = made;
        showToast(`Auto-start\n${buildMatchToastMessage(mode, match.result, match.team1, match.team2, match.balanceText)}`, "success");
      } else if (made.length > 1) {
        const started = made.filter((match) => match.result.status === "assigned");
        const courts = started.map((match) => `Court ${match.result.courtNo}`).join(", ");
        const queued = made.length > started.length ? " + 1 ready in Up Next" : "";
        showToast(`Auto-start: started ${started.length} ${started.length === 1 ? "match" : "matches"} (${courts})${queued}`, "success");
      } else if (stopReason) {
        // A court is free but no match could be made (e.g. not enough ready players).
        showToast(`Auto-start: a court is free, but ${stopReason.charAt(0).toLowerCase()}${stopReason.slice(1)}`, "info");
      }
      if (made.length > 0) reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Auto-start could not start a match"), "error");
      reloadQueue(queryClient, queueId);
    },
  });
}

// "Finish Game" on a court. Shows the old API message as the toast.
export function useFinishGame(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Takes the finished match off its court on screen right away, so it can't
  // be finished twice while the reload is still on its way (slow connection).
  const dropFromCourts = (matchId: string) =>
    queryClient.setQueryData<MatchWithPlayers[]>(matchKeys.active(queueId), (matches) =>
      matches?.filter((match) => match.id !== matchId),
    );

  return useMutation({
    mutationFn: ({ courtNo, matchId }: { courtNo: number; matchId: string }) => finishGame(queueId, courtNo, matchId),
    onSuccess: (message, { matchId }) => {
      dropFromCourts(matchId);
      showToast(message, "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error, { matchId }) => {
      // "Court is not occupied" / "This court already changed": the match shown
      // is no longer on that court, so stop showing it there.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P0001") dropFromCourts(matchId);
      showToast(toUserMessage(error, "Failed to finish game"), "error");
      // The court may have changed under us: show the latest state.
      reloadQueue(queryClient, queueId);
    },
  });
}

export function useResetMatchmaking(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (includePlayersOnBreak: boolean) => resetMatchmaking(queueId, includePlayersOnBreak),
    onSuccess: (message) => {
      showToast(message, "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Failed to reset matchmaking"), "error");
    },
  });
}

export function useCancelQueuedMatch(queueId: string) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (matchId: string) => cancelQueuedMatch(queueId, matchId),
    onSuccess: () => {
      showToast("Queued match cancelled", "success");
      reloadQueue(queryClient, queueId);
    },
    onError: (error) => {
      showToast(toUserMessage(error, "Failed to cancel queued match"), "error");
    },
  });
}
