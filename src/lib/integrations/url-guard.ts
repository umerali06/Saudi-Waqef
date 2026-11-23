import { lookup } from "dns/promises";
import { isIP } from "net";

const isPrivateIpv4 = (value: string) => {
  const [a, b] = value.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
};

const isPrivateAddress = (value: string) => {
  const address = value.toLowerCase();
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return (
    address === "::" ||
    address === "::1" ||
    /^f[cd]/.test(address) ||
    /^fe[89ab]/.test(address) ||
    address.startsWith("::ffff:")
  );
};

export const isPrivateHostname = (hostname: string) => {
  const value = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".localhost")) return true;
  if (value.endsWith(".local") || value.endsWith(".internal")) return true;
  return isIP(value) !== 0 && isPrivateAddress(value);
};

/**
 * Integration URLs are typed by tenants and requested from our servers, so on
 * a deployment they must not reach the private network or a metadata service.
 */
export async function assertPublicUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Integration endpoint must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV !== "production") return;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHostname(hostname)) {
    throw new Error("Integration endpoint cannot target a private host.");
  }
  if (isIP(hostname) === 0) {
    const addresses = await lookup(hostname, { all: true }).catch(() => {
      throw new Error(`Integration endpoint host was not found: ${hostname}`);
    });
    if (addresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error("Integration endpoint cannot target a private host.");
    }
  }
}
