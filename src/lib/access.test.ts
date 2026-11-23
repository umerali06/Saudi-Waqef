import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data/companies", () => ({ getCompanyById: vi.fn() }));
vi.mock("@/lib/data/memberships", () => ({ getMembership: vi.fn() }));

import { hasRequiredRole } from "@/lib/access";
import { canAccessPath } from "@/lib/permissions";

describe("hasRequiredRole", () => {
  it("does not let one specialist role stand in for another", () => {
    expect(hasRequiredRole("hr", ["owner", "admin", "accountant"])).toBe(false);
    expect(hasRequiredRole("accountant", ["owner", "admin", "hr"])).toBe(false);
    expect(hasRequiredRole("employee", ["owner", "admin", "accountant", "viewer"])).toBe(false);
    expect(hasRequiredRole("viewer", ["viewer"])).toBe(true);
  });

  it("lets owners through always and admins unless the list is owner-only", () => {
    expect(hasRequiredRole("owner", ["hr"])).toBe(true);
    expect(hasRequiredRole("admin", ["accountant"])).toBe(true);
    expect(hasRequiredRole("admin", ["owner"])).toBe(false);
  });
});

describe("accountant settings", () => {
  it("opens only the accounting pages", () => {
    expect(canAccessPath("accountant", "/settings/journal-entries")).toBe(true);
    expect(canAccessPath("accountant", "/settings/chart-of-accounts")).toBe(true);
    expect(canAccessPath("accountant", "/settings")).toBe(false);
    expect(canAccessPath("accountant", "/settings/users")).toBe(false);
  });
});
