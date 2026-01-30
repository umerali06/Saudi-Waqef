import { describe, expect, it } from "vitest";
import { getPasswordIssues } from "@/lib/security/password-policy";

describe("password policy", () => {
  it("flags short passwords", () => {
    const issues = getPasswordIssues("Short1!");
    expect(issues).toContain("minLength");
  });

  it("flags missing character classes", () => {
    const issues = getPasswordIssues("alllowercase123!");
    expect(issues).toContain("uppercase");
  });

  it("accepts strong passwords", () => {
    const issues = getPasswordIssues("ValidPass1!");
    expect(issues.length).toBe(0);
  });

  it("flags common passwords", () => {
    const issues = getPasswordIssues("Password123!");
    expect(issues).toContain("common");
  });
});
