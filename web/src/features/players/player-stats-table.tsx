import { SKILL_LABELS } from "@/features/players/player-status";
import { formatCurrency } from "@/lib/format";
import type { Player } from "@/services/players";

interface Props {
  players: Player[];
  // What each player has been billed (court fee + game rates + adjustments).
  billedByPlayerId: Map<number, number>;
  onRemove: (player: Player) => void;
}

// The Players tab (ported from the old PlayerStatsTable). The old "Total Paid"
// column actually showed the amount billed, so it is now labeled "Total Billed".
export function PlayerStatsTable({ players, billedByPlayerId, onRemove }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full overflow-hidden rounded-xl border border-sky-200 bg-white text-sm shadow-sm">
        <thead className="border-b border-sky-200 bg-sky-50">
          <tr>
            {["Player", "Skill", "Queue Position", "Games Played", "Total Billed", "Action"].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-3 text-left font-medium text-slate-500">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-slate-500">
                No players yet
              </td>
            </tr>
          ) : (
            players.map((player) => {
              const isLocked = player.is_playing || player.is_waiting_match;
              return (
                <tr key={player.id} className="border-b border-sky-100 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-slate-700">{player.name}</td>
                  <td className="px-4 py-3 text-slate-500">{SKILL_LABELS[player.skill]}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                      #{player.queue_position + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{player.games_played}</td>
                  <td className="px-4 py-3 font-medium text-blue-700">{formatCurrency(billedByPlayerId.get(player.id) ?? 0)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onRemove(player)}
                      disabled={isLocked}
                      title={isLocked ? "Players on court or up next can't be removed" : undefined}
                      aria-label={`Remove ${player.name}`}
                      className="rounded-lg border border-sky-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-sky-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
