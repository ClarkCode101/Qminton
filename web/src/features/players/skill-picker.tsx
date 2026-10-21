import { SKILL_DOT, SKILL_LABELS, SKILLS } from "@/features/players/player-status";
import type { SkillLevel } from "@/services/players";

// A dot in the skill's color (owner chose it over the old signal bars): the same
// light / mid / dark blue as the initials circles in the lists.
export function SkillDot({ skill }: { skill: SkillLevel }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${SKILL_DOT[skill]}`} />;
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
            {/* Only the picked skill shows its dot: a dot on every option was too much (owner). */}
            {selected && <SkillDot skill={skill.value} />}
            {SKILL_LABELS[skill.value]}
          </button>
        );
      })}
    </div>
  );
}
