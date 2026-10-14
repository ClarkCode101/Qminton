import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/toast";
import { AuthContext } from "@/features/auth/auth-context";
import { LoginPage } from "@/pages/login-page";
import { signInWithPassword } from "@/services/auth";

// Never talk to the real Supabase in tests.
vi.mock("@/services/auth", () => ({ signInWithPassword: vi.fn() }));
const signInMock = vi.mocked(signInWithPassword);

function renderLogin() {
  const router = createMemoryRouter([{ path: "/login", element: <LoginPage /> }], {
    initialEntries: ["/login"],
  });
  render(
    <ToastProvider>
      <AuthContext.Provider value={{ session: null, isLoading: false }}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </ToastProvider>,
  );
}

async function submitLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
  });
}

function rejectWithCode(code: string) {
  signInMock.mockImplementation(async () => {
    throw Object.assign(new Error(code), { code });
  });
}

describe("LoginPage", () => {
  // Block body on purpose: if beforeEach *returns* a function, Vitest runs it
  // as cleanup after the test, and mockReset() returns the mock itself.
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("logs in with the trimmed email and the password as typed", async () => {
    signInMock.mockResolvedValue();
    renderLogin();

    await submitLogin("  juan@example.com ", " secret ");

    expect(signInMock).toHaveBeenCalledWith("juan@example.com", " secret ");
  });

  it("shows readable errors for missing fields and sends nothing", async () => {
    renderLogin();

    await submitLogin("juan", "");

    expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Please enter your password")).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("says 'Wrong email or password' for bad credentials", async () => {
    rejectWithCode("invalid_credentials");
    renderLogin();

    await submitLogin("juan@example.com", "wrong");

    expect(screen.getByText("Wrong email or password.")).toBeInTheDocument();
  });

  it("explains the rate limit instead of showing a raw error", async () => {
    rejectWithCode("over_request_rate_limit");
    renderLogin();

    await submitLogin("juan@example.com", "secret");

    expect(
      screen.getByText("Too many login attempts. Please wait a few minutes and try again."),
    ).toBeInTheDocument();
  });
});
