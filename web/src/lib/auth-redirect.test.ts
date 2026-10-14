import { describe, expect, it } from "vitest";

import { buildLoginPath, loginFormSchema, safeNextPath } from "@/lib/auth-redirect";

describe("safeNextPath", () => {
  it("keeps paths inside the app", () => {
    expect(safeNextPath("/queue/abc")).toBe("/queue/abc");
    expect(safeNextPath("/landing?sort=latest")).toBe("/landing?sort=latest");
  });

  it("falls back to / for missing or outside links", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });
});

describe("buildLoginPath", () => {
  it("adds the page to return to", () => {
    expect(buildLoginPath("/queue/abc")).toBe("/login?next=%2Fqueue%2Fabc");
  });

  it("skips next for the home page", () => {
    expect(buildLoginPath("/")).toBe("/login");
  });
});

describe("loginFormSchema", () => {
  it("trims the email but keeps the password exactly as typed", () => {
    expect(loginFormSchema.parse({ email: "  juan@example.com ", password: " pw " })).toEqual({
      email: "juan@example.com",
      password: " pw ",
    });
  });

  it("rejects empty and invalid emails with readable messages", () => {
    const empty = loginFormSchema.safeParse({ email: "   ", password: "pw" });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0].message).toBe("Please enter your email");

    const invalid = loginFormSchema.safeParse({ email: "juan", password: "pw" });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0].message).toBe("Please enter a valid email");
  });

  it("requires a password", () => {
    const result = loginFormSchema.safeParse({ email: "juan@example.com", password: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Please enter your password");
  });
});
