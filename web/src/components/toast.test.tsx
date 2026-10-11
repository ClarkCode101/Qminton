import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/toast";
import { useToast } from "@/hooks/use-toast";

function TriggerButton({ message }: { message: string }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(message, "success")}>notify</button>;
}

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows each line of a multi-line message and hides it after 4 seconds", () => {
    render(
      <ToastProvider>
        <TriggerButton message={"Game Created!\nCourt 1"} />
      </ToastProvider>,
    );

    act(() => screen.getByText("notify").click());
    expect(screen.getByText("Game Created!")).toBeInTheDocument();
    expect(screen.getByText("Court 1")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("Game Created!")).not.toBeInTheDocument();
  });
});
