import { SKILL_LABELS, SKILLS } from "@/features/players/player-status";
import type { SkillLevel } from "@/services/players";

// Three bars, filled up to the skill level (from the old Add Player modal).
export function SkillIcon({ bars }: { bars: 1 | 2 | 3 }) {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="12" width="7" height="8" rx="1.5" opacity={bars >= 1 ? 1 : 0.2} />
      <rect x="10" y="7" width="7" height="13" rx="1.5" opacity={bars >= 2 ? 1 : 0.2} />
      <rect x="20" y="0" width="7" height="20" rx="1.5" opacity={bars >= 3 ? 1 : 0.2} />
    </svg>
  );
}

const optionClass = (selected: boolean) =>
  `border-2 rounded-lg cursor-pointer transition-all text-center font-medium ${
    selected ? "border-blue-600 bg-blue-50 text-blue-800" : "border-sky-200 bg-white hover:border-blue-400 text-slate-600"
  }`;

// Big picker with labels (single add).
export function SkillPicker({ value, onChange }: { value: SkillLevel; onChange: (skill: SkillLevel) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Skill level">
      {SKILLS.map((skill) => (
        <button
          key={skill.value}
          type="button"
          role="radio"
          aria-checked={value === skill.value}
          onClick={() => onChange(skill.value)}
          className={`p-4 text-sm ${optionClass(value === skill.value)}`}
        >
          <div className="mb-2 flex justify-center">
            <SkillIcon bars={skill.bars} />
          </div>
          {SKILL_LABELS[skill.value]}
        </button>
      ))}
    </div>
  );
}

// Icon-only picker for each row of a bulk paste.
export function CompactSkillPicker({
  value,
  onChange,
  playerName,
}: {
  value: SkillLevel;
  onChange: (skill: SkillLevel) => void;
  playerName: string;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={`Skill level for ${playerName}`}>
      {SKILLS.map((skill) => (
        <button
          key={skill.value}
          type="button"
          role="radio"
          aria-checked={value === skill.value}
          aria-label={SKILL_LABELS[skill.value]}
          title={SKILL_LABELS[skill.value]}
          onClick={() => onChange(skill.value)}
          className={`flex-1 p-2 text-xs ${optionClass(value === skill.value)}`}
        >
          <div className="flex justify-center">
            <SkillIcon bars={skill.bars} />
          </div>
        </button>
      ))}
    </div>
  );
}
