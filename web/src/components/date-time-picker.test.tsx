import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DateTimePicker } from "@/components/date-time-picker";

const today = new Date(2026, 9, 21); // Wed, Oct 21 2026

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker value={value} onChange={setValue} today={today} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const value = () => screen.getByTestId("value").textContent;

describe("DateTimePicker", () => {
  it("shows 5 days and a 6th 'More dates' card", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Day" });
    expect(group.querySelectorAll("button")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Wednesday, October 21" })).toHaveTextContent("Today");
    expect(screen.getByRole("button", { name: "Thursday, October 22" })).toHaveTextContent("Tmrw");
    expect(screen.getByRole("button", { name: "More dates" })).toBeInTheDocument();
  });

  it("needs both a day and a time; the clock starts from 6:00 PM", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Hour")).toHaveValue("--");
    fireEvent.click(screen.getByRole("button", { name: "Friday, October 23" }));
    expect(value()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Hour down" }));
    expect(value()).toBe("2026-10-23T17:00");
    expect(screen.queryByRole("group", { name: "Quick times" })).not.toBeInTheDocument();
  });

  it("'More dates' opens a month calendar inside the picker", () => {
    render(<Harness initial="2026-10-21T18:00" />);
    fireEvent.click(screen.getByRole("button", { name: "More dates" }));
    const calendar = screen.getByRole("group", { name: "Calendar" });
    expect(within(calendar).getByText("October 2026")).toBeInTheDocument();
    // Can't go back before this month, and past days can't be picked.
    expect(within(calendar).getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(within(calendar).getByRole("button", { name: "Tuesday, October 20, 2026" })).toBeDisabled();

    fireEvent.click(within(calendar).getByRole("button", { name: "Next month" }));
    expect(within(calendar).getByText("November 2026")).toBeInTheDocument();
    fireEvent.click(within(calendar).getByRole("button", { name: "Tuesday, November 3, 2026" }));

    expect(value()).toBe("2026-11-03T18:00");
    // It closes, and the 6th card now shows the date.
    expect(screen.queryByRole("group", { name: "Calendar" })).not.toBeInTheDocument();
    expect(screen.getByText("Nov")).toBeInTheDocument();
  });

  it("works like a digital clock: arrows, typing and AM/PM", () => {
    render(<Harness initial="2026-10-23T17:30" />);
    expect(screen.getByLabelText("Hour")).toHaveValue("05");
    expect(screen.getByLabelText("Minutes")).toHaveValue("30");

    fireEvent.click(screen.getByRole("button", { name: "Hour up" }));
    expect(value()).toBe("2026-10-23T18:30");
    fireEvent.click(screen.getByRole("button", { name: "Minutes up" }));
    expect(value()).toBe("2026-10-23T18:35");
    fireEvent.click(screen.getByRole("button", { name: "Minutes down" }));
    fireEvent.click(screen.getByRole("button", { name: "Minutes down" }));
    expect(value()).toBe("2026-10-23T18:25");

    // 12 → 1 wraps; typing a valid number is kept when leaving the box.
    const hour = screen.getByLabelText("Hour");
    fireEvent.change(hour, { target: { value: "12" } });
    fireEvent.blur(hour);
    expect(value()).toBe("2026-10-23T12:25");
    fireEvent.click(screen.getByRole("button", { name: "Hour up" }));
    expect(value()).toBe("2026-10-23T13:25");

    // A wrong number is ignored.
    const minutes = screen.getByLabelText("Minutes");
    fireEvent.change(minutes, { target: { value: "75" } });
    fireEvent.blur(minutes);
    expect(value()).toBe("2026-10-23T13:25");

    fireEvent.click(screen.getByRole("button", { name: "AM" }));
    expect(value()).toBe("2026-10-23T01:25");
    expect(screen.getByText("Fri, Oct 23 · 1:25 AM")).toBeInTheDocument();
  });

  it("shows a later date in the 6th card", () => {
    render(<Harness initial="2026-11-03T19:00" />);
    expect(screen.queryByRole("button", { name: "More dates" })).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Nov")).toBeInTheDocument();
  });
});
