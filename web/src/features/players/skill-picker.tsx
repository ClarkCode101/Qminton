import { SKILL_LABELS, SKILLS } from "@/features/players/player-status";
import type { SkillLevel } from "@/services/players";

// Three bars, filled up to the skill level (from the old Add Player modal).
export function SkillIcon({ bars }: { bars: 1 | 2 | 3 }) {
  return (
    <svg width="14" height="10" viewBox="0 0 28 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="12" width="7" height="8" rx="1.5" opacity={bars >= 1 ? 1 : 0.25} />
      <rect x="10" y="7" width="7" height="13" rx="1.5" opacity={bars >= 2 ? 1 : 0.25} />
      <rect x="20" y="0" width="7" height="20" rx="1.5" opacity={bars >= 3 ? 1 : 0.25} />
    </svg>
  );
}

// One-tap skill choice with the words written out (the old bulk picker had
// icons only, so it was hard to tell the levels apart). 36px tall for tablets.
export function SkillSegmented({
  value,
  onChange,
  label,
  fill = false,
}: {
  value: SkillLevel | null;
  onChange: (skill: SkillLevel) => void;
  // Read out by screen readers, e.g. "Skill level for Clark".
  label: string;
  // Full width on phones (three equal parts), normal size from 640px.
  fill?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`rounded-xl border border-slate-200 bg-slate-50 p-0.5 ${fill ? "flex w-full sm:inline-flex sm:w-auto" : "inline-flex"}`}
    >
      {SKILLS.map((skill) => {
        const selected = value === skill.value;
        return (
          <button
            key={skill.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(skill.value)}
            className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition-colors cursor-pointer ${
              fill ? "flex-1 sm:flex-none" : ""
            } ${
              selected ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <SkillIcon bars={skill.bars} />
            {SKILL_LABELS[skill.value]}
          </button>
        );
      })}
    </div>
  );
}
