import { useId, useState } from "react";

import { formatSessionDate } from "@/lib/format";

// Date and time without the browser's date-time box (owner, 2026-10-21):
// - Day: the next 5 days as cards; the 6th card, "More dates", opens a month
//   calendar right below them, inside the dialog.
// - Time: a digital clock only (▲▼ hour, ▲▼ minutes, AM/PM; hour and minutes
//   can also be typed).
// The value is the same text a datetime-local input uses: "YYYY-MM-DDTHH:mm",
// or "" until both a day and a time are picked.

const DAYS_SHOWN = 5;
const MINUTE_STEP = 5;
// The clock starts from here when it is used before any time is picked.
const START_TIME = "18:00";

const pad = (value: number) => String(value).padStart(2, "0");
const toDateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateValue = (value: string) => new Date(`${value}T00:00`);

// "HH:mm" (24 h) <-> 12-hour clock parts.
function toParts(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return { hour: hours % 12 === 0 ? 12 : hours % 12, minute: minutes, pm: hours >= 12 };
}
function fromParts(hour: number, minute: number, pm: boolean): string {
  return `${pad((hour % 12) + (pm ? 12 : 0))}:${pad(minute)}`;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  // For tests: the day "Today" is.
  today?: Date;
}

export function DateTimePicker({ value, onChange, invalid = false, describedBy, today: todayProp }: Props) {
  const ids = useId();
  // "Today" is read once when the picker opens.
  const [today] = useState(() => todayProp ?? new Date());
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16));

  const days = Array.from({ length: DAYS_SHOWN }, (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + index));
  const isLaterDate = date !== "" && !days.some((day) => toDateValue(day) === date);
  // Owner's choice: our own month calendar, inside the dialog under the day cards
  // (the browser's calendar popped up outside the dialog).
  const [showCalendar, setShowCalendar] = useState(false);

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : "");
  };
  const setClock = (nextTime: string) => update(date, nextTime);

  const cardClass = (selected: boolean) =>
    `flex min-w-0 flex-col items-center rounded-2xl border py-2 transition-colors cursor-pointer ${
      selected ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-sky-300"
    }`;
  const smallText = (selected: boolean) => `text-[11px] font-semibold ${selected ? "text-blue-100" : "text-slate-500"}`;

  return (
    <div className="space-y-4" aria-describedby={describedBy}>
      <div>
        <p id={`${ids}-day`} className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Day
        </p>
        <div role="group" aria-labelledby={`${ids}-day`} className="grid grid-cols-6 gap-1.5">
          {days.map((day, index) => {
            const dayValue = toDateValue(day);
            const selected = date === dayValue;
            return (
              <button
                key={dayValue}
                type="button"
                aria-pressed={selected}
                aria-label={day.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}
                onClick={() => update(dayValue, time)}
                className={cardClass(selected)}
              >
                <span className={`${smallText(selected)} uppercase`}>{day.toLocaleDateString("en-PH", { weekday: "short" })}</span>
                <span className="text-lg font-bold leading-7 tabular-nums">{day.getDate()}</span>
                <span className={smallText(selected)}>
                  {index === 0 ? "Today" : index === 1 ? "Tmrw" : day.toLocaleDateString("en-PH", { month: "short" })}
                </span>
              </button>
            );
          })}
          {/* 6th card: opens our month calendar below; shows the later date once picked. */}
          <button
            type="button"
            aria-pressed={isLaterDate}
            aria-expanded={showCalendar}
            onClick={() => setShowCalendar((current) => !current)}
            className={
              isLaterDate
                ? cardClass(true)
                : `flex min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed px-1 py-2 text-center transition-colors cursor-pointer ${
                    showCalendar ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:border-sky-300"
                  }`
            }
          >
            {isLaterDate ? (
              <>
                <span className={`${smallText(true)} uppercase`}>{fromDateValue(date).toLocaleDateString("en-PH", { weekday: "short" })}</span>
                <span className="text-lg font-bold leading-7 tabular-nums">{fromDateValue(date).getDate()}</span>
                <span className={smallText(true)}>{fromDateValue(date).toLocaleDateString("en-PH", { month: "short" })}</span>
              </>
            ) : (
              <span className="text-[11px] font-semibold leading-4">More dates</span>
            )}
          </button>
        </div>

        {showCalendar && (
          <MonthCalendar
            today={today}
            selected={date}
            onPick={(picked) => {
              update(picked, time);
              setShowCalendar(false);
            }}
          />
        )}
      </div>

      <div>
        <p id={`${ids}-time`} className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Time
        </p>
        <DigitalClock time={time} onChange={setClock} labelledBy={`${ids}-time`} />
      </div>

      <p
        aria-live="polite"
        className={`rounded-xl px-3 py-2 text-sm ${
          date && time ? "bg-slate-50 font-semibold text-slate-800" : invalid ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"
        }`}
      >
        {date && time ? formatSessionDate(`${date}T${time}`) : !date && !time ? "Pick a day and a time" : !date ? "Pick a day" : "Pick a time"}
      </p>
    </div>
  );
}

// A month at a time, inside the dialog. Days before today can't be picked.
function MonthCalendar({ today, selected, onPick }: { today: Date; selected: string; onPick: (date: string) => void }) {
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [month, setMonth] = useState(() => (selected ? new Date(fromDateValue(selected).getFullYear(), fromDateValue(selected).getMonth(), 1) : firstOfThisMonth));
  const todayValue = toDateValue(today);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  // Empty cells before the 1st so it lands under its weekday (Sunday first).
  const blanks = month.getDay();
  const canGoBack = month > firstOfThisMonth;
  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  const navClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer";

  return (
    <div role="group" aria-label="Calendar" className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={!canGoBack} onClick={() => shift(-1)} className={navClass}>
          ‹
        </button>
        <p className="text-sm font-bold text-slate-900" aria-live="polite">
          {month.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}
        </p>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className={navClass}>
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((weekday) => (
          <span key={weekday} className="py-1 text-[11px] font-semibold text-slate-400">
            {weekday}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const dayValue = toDateValue(day);
          const isPast = dayValue < todayValue;
          const isSelected = dayValue === selected;
          return (
            <button
              key={dayValue}
              type="button"
              disabled={isPast}
              aria-pressed={isSelected}
              aria-label={day.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              onClick={() => onPick(dayValue)}
              className={`inline-flex h-9 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : isPast
                    ? "cursor-not-allowed text-slate-300"
                    : `cursor-pointer text-slate-700 hover:bg-sky-50 ${dayValue === todayValue ? "ring-1 ring-blue-300" : ""}`
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// [▲ 06 ▼] : [▲ 30 ▼]  [AM|PM]. Arrows step 1 hour / 5 minutes (wrapping
// around); the numbers can be typed too.
function DigitalClock({ time, onChange, labelledBy }: { time: string; onChange: (time: string) => void; labelledBy: string }) {
  const parts = toParts(time || START_TIME);
  const isSet = time !== "";
  // What is typed in the boxes before it is checked (on leaving the box).
  const [hourDraft, setHourDraft] = useState<string | null>(null);
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null);

  const set = (hour: number, minute: number, pm: boolean) => onChange(fromParts(hour, minute, pm));
  const hourText = hourDraft ?? (isSet ? pad(parts.hour) : "--");
  const minuteText = minuteDraft ?? (isSet ? pad(parts.minute) : "--");

  const arrowClass =
    "flex h-7 w-full items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 cursor-pointer";
  const boxClass =
    "h-12 w-14 rounded-xl border border-slate-200 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  const arrow = (direction: "up" | "down") => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={direction === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );

  return (
    <div role="group" aria-labelledby={labelledBy} className="flex items-center justify-center gap-2">
      <div className="flex w-14 flex-col items-center">
        <button type="button" aria-label="Hour up" onClick={() => set((parts.hour % 12) + 1, parts.minute, parts.pm)} className={arrowClass}>
          {arrow("up")}
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Hour"
          maxLength={2}
          value={hourText}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setHourDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            const typed = Number(hourDraft);
            if (hourDraft !== null && hourDraft !== "" && typed >= 1 && typed <= 12) set(typed, parts.minute, parts.pm);
            setHourDraft(null);
          }}
          className={boxClass}
        />
        <button type="button" aria-label="Hour down" onClick={() => set(((parts.hour + 10) % 12) + 1, parts.minute, parts.pm)} className={arrowClass}>
          {arrow("down")}
        </button>
      </div>

      <span className="pb-0.5 text-2xl font-bold text-slate-400" aria-hidden="true">
        :
      </span>

      <div className="flex w-14 flex-col items-center">
        <button
          type="button"
          aria-label="Minutes up"
          onClick={() => set(parts.hour, (Math.floor(parts.minute / MINUTE_STEP) * MINUTE_STEP + MINUTE_STEP) % 60, parts.pm)}
          className={arrowClass}
        >
          {arrow("up")}
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label="Minutes"
          maxLength={2}
          value={minuteText}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setMinuteDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            const typed = Number(minuteDraft);
            if (minuteDraft !== null && minuteDraft !== "" && typed >= 0 && typed <= 59) set(parts.hour, typed, parts.pm);
            setMinuteDraft(null);
          }}
          className={boxClass}
        />
        <button
          type="button"
          aria-label="Minutes down"
          onClick={() => set(parts.hour, (Math.ceil(parts.minute / MINUTE_STEP) * MINUTE_STEP - MINUTE_STEP + 60) % 60, parts.pm)}
          className={arrowClass}
        >
          {arrow("down")}
        </button>
      </div>

      <div className="ml-1 flex flex-col gap-1.5">
        {(["AM", "PM"] as const).map((period) => {
          const selected = isSet && parts.pm === (period === "PM");
          return (
            <button
              key={period}
              type="button"
              aria-pressed={selected}
              onClick={() => set(parts.hour, parts.minute, period === "PM")}
              className={`inline-flex h-9 w-14 items-center justify-center rounded-xl border text-sm font-bold transition-colors cursor-pointer ${
                selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"
              }`}
            >
              {period}
            </button>
          );
        })}
      </div>
    </div>
  );
}
