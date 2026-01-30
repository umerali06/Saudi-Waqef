import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("SuperSecret123");
    const isValid = await verifyPassword("SuperSecret123", hash);
    const isInvalid = await verifyPassword("WrongPassword", hash);

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });
});
