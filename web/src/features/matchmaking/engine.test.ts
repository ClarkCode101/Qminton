import { describe, expect, it } from "vitest";

import {
  buildBalanceText,
  buildDoublesExplanation,
  buildSinglesExplanation,
  emptyPairMemory,
  pairKey,
  pickMatch,
  type EnginePlayer,
  type MatchmakingInput,
  type PairMemory,
} from "@/features/matchmaking/engine";
import { createSeededRng } from "@/lib/random";

let nextId = 1;
function player(name: string, overrides: Partial<EnginePlayer> = {}): EnginePlayer {
  const id = nextId++;
  return {
    id,
    name,
    skill: "intermediate",
    queuePosition: id,
    gamesPlayed: 0,
    isPlaying: false,
    isWaitingMatch: false,
    isPaused: false,
    restGamesNeeded: 0,
    ...overrides,
  };
}

function run(overrides: Partial<MatchmakingInput> & { players: EnginePlayer[] }, seed = 1) {
  return pickMatch({
    mode: "doubles",
    currentMatchNo: 0,
    hasPendingMatches: false,
    memory: emptyPairMemory(),
    rng: createSeededRng(seed),
    ...overrides,
  });
}

function names(result: ReturnType<typeof pickMatch>) {
  if (!result.ok) throw new Error(result.message);
  return {
    team1: result.team1.map((p) => p.name).sort(),
    team2: result.team2.map((p) => p.name).sort(),
    all: [...result.team1, ...result.team2].map((p) => p.name).sort(),
  };
}

function memoryWith(entries: Partial<Record<keyof PairMemory, [EnginePlayer, EnginePlayer, number][]>>): PairMemory {
  const memory = emptyPairMemory();
  for (const [kind, list] of Object.entries(entries) as [keyof PairMemory, [EnginePlayer, EnginePlayer, number][]][]) {
    for (const [a, b, value] of list) memory[kind].set(pairKey(a.id, b.id), value);
  }
  return memory;
}

describe("pickMatch: who can play", () => {
  it("needs enough free players (same message as the old API)", () => {
    const players = [player("A"), player("B"), player("C"), player("D", { isPaused: true })];
    expect(run({ players })).toEqual({ ok: false, message: "Need at least 4 available (non-playing) players" });
    expect(run({ mode: "singles", players: [player("A"), player("B", { isPlaying: true })] })).toEqual({
      ok: false,
      message: "Need at least 2 available (non-playing) players",
    });
  });

  it("never picks players on court, in Up Next, or on break", () => {
    const players = [
      player("Court", { isPlaying: true }),
      player("Next", { isWaitingMatch: true }),
      player("Break", { isPaused: true }),
      player("A"),
      player("B"),
      player("C"),
      player("D"),
    ];
    expect(names(run({ players })).all).toEqual(["A", "B", "C", "D"]);
  });

  it("refuses to force resting players in while queued matches are waiting", () => {
    const players = [player("A"), player("B"), player("C", { restGamesNeeded: 1 }), player("D", { restGamesNeeded: 1 })];
    expect(run({ players, hasPendingMatches: true })).toEqual({
      ok: false,
      message: "Not enough rested players. Finish a court to release the queued matches first.",
    });
  });

  it("without queued matches, fills up with the least-resting players", () => {
    const players = [
      player("A"),
      player("B"),
      player("Rest2", { restGamesNeeded: 2 }),
      player("Rest1a", { restGamesNeeded: 1 }),
      player("Rest1b", { restGamesNeeded: 1 }),
    ];
    expect(names(run({ players })).all).toEqual(["A", "B", "Rest1a", "Rest1b"]);
  });

  it("prefers rested players even when a resting buffer is added", () => {
    const players = [
      player("R1"),
      player("R2"),
      player("R3"),
      player("R4"),
      player("Tired1", { restGamesNeeded: 1 }),
      player("Tired2", { restGamesNeeded: 1 }),
    ];
    expect(names(run({ players })).all).toEqual(["R1", "R2", "R3", "R4"]);
  });

  it("gives earlier queue spots the next turn", () => {
    const players = ["Early1", "Early2", "Early3", "Early4", "Late1", "Late2"].map((name) => player(name));
    expect(names(run({ players })).all).toEqual(["Early1", "Early2", "Early3", "Early4"]);
  });

  it("leaves out players with the most games when the pool is full (old: only the first 8 are scored)", () => {
    const fresh = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map((name) => player(name));
    // First in the queue, but has played more: sorted after the 8 fresh players, so not in the pool.
    const busy = player("Busy", { gamesPlayed: 3, queuePosition: 0 });
    expect(names(run({ players: [busy, ...fresh] })).all).not.toContain("Busy");
  });
});

describe("pickMatch: fairness", () => {
  it("doubles: splits players who were just partners", () => {
    const [a, b, c, d] = [player("A"), player("B"), player("C"), player("D")];
    const memory = memoryWith({ partner: [[a, b, 3]], pair: [[a, b, 3]] });
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = names(run({ players: [a, b, c, d], memory, currentMatchNo: 3 }, seed));
      const sameTeam = [result.team1, result.team2].some((team) => team.includes("A") && team.includes("B"));
      expect(sameTeam).toBe(false);
    }
  });

  it("doubles: balances skill when nothing else differs", () => {
    const players = [
      player("Adv1", { skill: "advance" }),
      player("Adv2", { skill: "advance" }),
      player("Beg1", { skill: "beginner" }),
      player("Beg2", { skill: "beginner" }),
    ];
    const result = run({ players });
    expect(result.ok && result.balanceText).toBe("Perfectly balanced!");
  });

  it("singles: avoids an immediate rematch when someone else is free", () => {
    const [a, b, c] = [player("A"), player("B"), player("C")];
    const memory = memoryWith({ opponent: [[a, b, 5]], opponentCount: [[a, b, 1]] });
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(names(run({ mode: "singles", players: [a, b, c], memory, currentMatchNo: 5 }, seed)).all).not.toEqual(["A", "B"]);
    }
  });

  it("singles: allows the rematch when it's the only option", () => {
    const [a, b] = [player("A"), player("B")];
    const memory = memoryWith({ opponent: [[a, b, 5]] });
    expect(names(run({ mode: "singles", players: [a, b], memory, currentMatchNo: 5 })).all).toEqual(["A", "B"]);
  });

  it("singles: picks among the top 3 pairings", () => {
    const players = ["A", "B", "C", "D", "E", "F"].map((name) => player(name));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      seen.add(names(run({ mode: "singles", players }, seed)).all.join("+"));
    }
    // The best three pairs by queue position are A+B, A+C, A+D.
    expect([...seen].sort()).toEqual(["A+B", "A+C", "A+D"]);
  });
});

describe("pickMatch: output", () => {
  it("is repeatable with the same seed and varies sides across seeds", () => {
    const players = ["A", "B", "C", "D", "E"].map((name) => player(name));
    expect(names(run({ players }, 42))).toEqual(names(run({ players }, 42)));

    const firstTeams = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) firstTeams.add(names(run({ players }, seed)).team1.join("+"));
    expect(firstTeams.size).toBeGreaterThan(1);
  });

  it("builds the old balance text", () => {
    expect(buildBalanceText([{ skill: "advance" }], [{ skill: "beginner" }])).toBe("Balance: 2 points");
    expect(buildBalanceText([{ skill: "advance" }], [{ skill: "intermediate" }])).toBe("Balance: 1 point");
  });

  it("builds the old explanations", () => {
    expect(buildSinglesExplanation({ skillDiff: 0, repeatPenalty: 0, countPenalty: 0, restPenalty: 0 })).toBe(
      "Picked a singles match that avoids a recent rematch, gives ready players the next turn, and keeps the matchup even.",
    );
    expect(buildSinglesExplanation({ skillDiff: 2, repeatPenalty: 60, countPenalty: 0, restPenalty: 5 })).toBe(
      "Picked a singles match that uses the best available pairing right now.",
    );
    expect(
      buildDoublesExplanation({ skillDiff: 1, partnerPenalty: 0, opponentPenalty: 0, quartetRepeatPenalty: 0, restPenalty: 5 }),
    ).toBe("Picked a doubles match that avoids recent repeat pairings, and keeps the teams close in level.");
  });
});
