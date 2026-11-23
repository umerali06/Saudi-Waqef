import { describe, expect, it } from "vitest";
import { isPrivateHostname } from "@/lib/integrations/url-guard";

describe("isPrivateHostname", () => {
  it("recognises private, loopback and metadata targets", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "[::1]", "[fd00::1]", "[fe80::1]", "db.internal", "[::ffff:10.0.0.1]"]) {
      expect(isPrivateHostname(host), host).toBe(true);
    }
  });

  it("allows public hosts", () => {
    for (const host of ["gw-fatoora.zatca.gov.sa", "8.8.8.8", "172.32.0.1", "fdic.example.com"]) {
      expect(isPrivateHostname(host), host).toBe(false);
    }
  });
});
