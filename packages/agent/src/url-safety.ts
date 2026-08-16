import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type SafeUrlTarget = {
  url: URL;
  addresses: ResolvedAddress[];
};

export async function resolvePublicUrl(
  input: string | URL,
  resolver: DnsResolver = systemDnsResolver,
): Promise<SafeUrlTarget> {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input) : new URL(input);
  } catch {
    throw new Error("Source URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP and HTTPS sources are supported");
  }
  if (url.username || url.password) {
    throw new Error("Source URLs containing credentials are not allowed");
  }
  if (!url.hostname) throw new Error("Source URL requires a hostname");
  if (url.port && !isStandardPort(url.protocol, url.port)) {
    throw new Error("Only standard HTTP and HTTPS ports are supported");
  }

  const urlHostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const hostname = urlHostname.startsWith("[") && urlHostname.endsWith("]")
    ? urlHostname.slice(1, -1)
    : urlHostname;
  if (isBlockedHostname(hostname)) {
    throw new Error(`Private or local hostname is blocked: ${hostname}`);
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily as 4 | 6 }]
    : await resolver(hostname);

  if (addresses.length === 0) {
    throw new Error(`Source hostname did not resolve: ${hostname}`);
  }
  for (const address of addresses) {
    if (!isPublicIpAddress(address.address)) {
      throw new Error(`Source resolves to a blocked network address: ${address.address}`);
    }
  }

  return { url, addresses };
}

export async function systemDnsResolver(hostname: string): Promise<ResolvedAddress[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => ({
    address: result.address,
    family: result.family as 4 | 6,
  }));
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isStandardPort(protocol: string, port: string): boolean {
  return (protocol === "http:" && port === "80") || (protocol === "https:" && port === "443");
}

function isBlockedHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  return [".localhost", ".local", ".internal", ".home", ".lan"].some((suffix) =>
    hostname.endsWith(suffix),
  );
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;

  const allZero = bytes.every((value) => value === 0);
  const loopback = bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1;
  if (allZero || loopback) return false;

  if (bytes[0] === 0xff) return false;
  if ((bytes[0]! & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return false;
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false;
  }
  if (bytes[0] === 0x01 && bytes.slice(1, 8).every((value) => value === 0)) return false;

  const mappedIpv4 = bytes.slice(0, 10).every((value) => value === 0)
    && bytes[10] === 0xff
    && bytes[11] === 0xff;
  if (mappedIpv4) {
    return isPublicIpv4(bytes.slice(12).join("."));
  }
  return true;
}

function ipv6Bytes(address: string): number[] | undefined {
  let normalized = address.toLowerCase();
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) normalized = normalized.slice(0, zoneIndex);

  const halves = normalized.split("::");
  if (halves.length > 2) return undefined;
  const left = parseIpv6Groups(halves[0] ?? "");
  const right = halves.length === 2 ? parseIpv6Groups(halves[1] ?? "") : [];
  if (!left || !right) return undefined;
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return undefined;
  }
  const groups = [...left, ...Array.from({ length: Math.max(0, missing) }, () => 0), ...right];
  if (groups.length !== 8) return undefined;
  return groups.flatMap((group) => [(group >> 8) & 0xff, group & 0xff]);
}

function parseIpv6Groups(part: string): number[] | undefined {
  if (!part) return [];
  const pieces = part.split(":");
  const groups: number[] = [];
  for (const piece of pieces) {
    if (piece.includes(".")) {
      const octets = piece.split(".").map(Number);
      if (octets.length !== 4 || octets.some((value) => value < 0 || value > 255)) return undefined;
      groups.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/.test(piece)) return undefined;
    groups.push(Number.parseInt(piece, 16));
  }
  return groups;
}
