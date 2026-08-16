import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import type { SourceArtifact } from "./contracts.ts";
import {
  resolvePublicUrl,
  systemDnsResolver,
  type DnsResolver,
  type SafeUrlTarget,
} from "./url-safety.ts";

export type RawHttpResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: Uint8Array;
};

export interface PinnedHttpTransport {
  get(
    target: SafeUrlTarget,
    options: { signal: AbortSignal; timeoutMs: number; maxBytes: number },
  ): Promise<RawHttpResponse>;
}

export type ExtractedPublicPage = SourceArtifact & {
  retrievalStatus: "available";
  extractedText: string;
  contentHash: string;
  retrievedAt: string;
  contentType: string;
  truncated: boolean;
};

export type PublicPageExtractorOptions = {
  resolver?: DnsResolver;
  transport?: PinnedHttpTransport;
  now?: () => string;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxExtractedCharacters?: number;
  timeoutMs?: number;
};

export class PublicPageExtractor {
  readonly #resolver: DnsResolver;
  readonly #transport: PinnedHttpTransport;
  readonly #now: () => string;
  readonly #maxRedirects: number;
  readonly #maxResponseBytes: number;
  readonly #maxExtractedCharacters: number;
  readonly #timeoutMs: number;

  constructor(options: PublicPageExtractorOptions = {}) {
    this.#resolver = options.resolver ?? systemDnsResolver;
    this.#transport = options.transport ?? new NodePinnedHttpTransport();
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#maxRedirects = options.maxRedirects ?? 5;
    this.#maxResponseBytes = options.maxResponseBytes ?? 1_500_000;
    this.#maxExtractedCharacters = options.maxExtractedCharacters ?? 120_000;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
  }

  async extract(input: {
    url: string;
    signal?: AbortSignal;
    sourceKind?: SourceArtifact["sourceKind"];
  }): Promise<ExtractedPublicPage> {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = setTimeout(() => controller.abort("page extraction timeout"), this.#timeoutMs);
    const visited = new Set<string>();
    const originalUrl = input.url;
    let currentUrl = input.url;

    try {
      for (let redirectCount = 0; redirectCount <= this.#maxRedirects; redirectCount += 1) {
        const target = await resolvePublicUrl(currentUrl, this.#resolver);
        if (visited.has(target.url.href)) throw new Error("Source redirect loop detected");
        visited.add(target.url.href);

        const response = await this.#transport.get(target, {
          signal: controller.signal,
          timeoutMs: this.#timeoutMs,
          maxBytes: this.#maxResponseBytes,
        });

        if (isRedirect(response.status)) {
          const location = response.headers.location;
          if (!location) throw new Error("Source redirect did not include a location");
          if (redirectCount === this.#maxRedirects) {
            throw new Error("Source exceeded the redirect limit");
          }
          currentUrl = new URL(location, target.url).href;
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Source returned HTTP ${response.status}`);
        }
        if (response.body.byteLength > this.#maxResponseBytes) {
          throw new Error("Source exceeded the response-size limit");
        }

        const contentType = normalizeContentType(response.headers["content-type"]);
        if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
          throw new Error(`Unsupported public source content type: ${contentType || "unknown"}`);
        }

        const decoded = new TextDecoder("utf-8", { fatal: false }).decode(response.body);
        const title = contentType === "text/plain"
          ? target.url.hostname
          : extractTitle(decoded) ?? target.url.hostname;
        const fullText = contentType === "text/plain"
          ? normalizeWhitespace(decoded)
          : htmlToReadableText(decoded);
        if (!fullText) throw new Error("Source contained no readable public text");
        const truncated = fullText.length > this.#maxExtractedCharacters;
        const extractedText = truncated
          ? fullText.slice(0, this.#maxExtractedCharacters).trimEnd()
          : fullText;
        const canonicalUrl = contentType === "text/plain"
          ? target.url.href
          : sameOriginCanonical(decoded, target.url) ?? target.url.href;

        return {
          originalUrl,
          canonicalUrl,
          domain: target.url.hostname,
          title,
          sourceKind: input.sourceKind ?? inferSourceKind(target.url),
          retrievalStatus: "available",
          extractedText,
          contentHash: createHash("sha256").update(extractedText).digest("hex"),
          retrievedAt: this.#now(),
          contentType,
          truncated,
          promptInjectionSignals: detectPromptInjectionSignals(extractedText),
        };
      }
      throw new Error("Source could not be extracted");
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }
}

export class NodePinnedHttpTransport implements PinnedHttpTransport {
  async get(
    target: SafeUrlTarget,
    options: { signal: AbortSignal; timeoutMs: number; maxBytes: number },
  ): Promise<RawHttpResponse> {
    const address = target.addresses.find((candidate) => candidate.family === 4)
      ?? target.addresses[0];
    if (!address) throw new Error("Source has no approved network address");
    const requester = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    const lookupPinned: LookupFunction = (_hostname, _options, callback) => {
      if (typeof _options === "object" && _options.all) {
        callback(null, [{ address: address.address, family: address.family }]);
        return;
      }
      callback(null, address.address, address.family);
    };

    return new Promise<RawHttpResponse>((resolve, reject) => {
      const request = requester(
        {
          protocol: target.url.protocol,
          hostname: target.url.hostname,
          port: target.url.port || undefined,
          path: `${target.url.pathname}${target.url.search}`,
          method: "GET",
          lookup: lookupPinned,
          signal: options.signal,
          timeout: options.timeoutMs,
          headers: {
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
            "Accept-Encoding": "identity",
            "User-Agent": "SwitchpathResearchBot/0.1 (+local MVP; public sources only)",
          },
        },
        (response) => {
          const contentLength = Number(response.headers["content-length"] ?? 0);
          if (contentLength > options.maxBytes) {
            response.destroy(new Error("Source exceeded the response-size limit"));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          response.on("data", (chunk: Buffer) => {
            total += chunk.byteLength;
            if (total > options.maxBytes) {
              response.destroy(new Error("Source exceeded the response-size limit"));
              return;
            }
            chunks.push(chunk);
          });
          response.once("end", () => {
            resolve({
              status: response.statusCode ?? 0,
              headers: {
                location: headerValue(response.headers.location),
                "content-type": headerValue(response.headers["content-type"]),
              },
              body: Buffer.concat(chunks),
            });
          });
          response.once("error", reject);
        },
      );
      request.once("timeout", () => request.destroy(new Error("Source request timed out")));
      request.once("error", reject);
      request.end();
    });
  }
}

const SUPPORTED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizeContentType(value: string | undefined): string {
  return (value ?? "").split(";", 1)[0]!.trim().toLowerCase();
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function extractTitle(html: string): string | undefined {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeHtmlEntities(stripTags(match[1] ?? "")).trim().slice(0, 300) : undefined;
}

function sameOriginCanonical(html: string, responseUrl: URL): string | undefined {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const link of links) {
    const rel = attribute(link, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("canonical")) continue;
    const href = attribute(link, "href");
    if (!href) continue;
    try {
      const candidate = new URL(href, responseUrl);
      if (candidate.origin === responseUrl.origin && ["http:", "https:"].includes(candidate.protocol)) {
        return candidate.href;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function htmlToReadableText(html: string): string {
  let value = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  value = decodeHtmlEntities(value);
  return normalizeWhitespace(value);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, token: string) => {
    if (token.startsWith("#x")) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith("#")) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return named[token.toLowerCase()] ?? match;
  });
}

function detectPromptInjectionSignals(text: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ["ignore_previous_instructions", /ignore (all |any )?(previous|prior|above) instructions/i],
    ["system_message_impersonation", /\b(system message|system prompt)\b/i],
    ["assistant_impersonation", /\b(assistant|chatgpt)\s*:/i],
    ["tool_execution_request", /\b(call|use|invoke|execute) (the )?(tool|function|command)\b/i],
    ["credential_request", /\b(api key|password|secret token|credentials)\b/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function inferSourceKind(url: URL): SourceArtifact["sourceKind"] {
  const path = url.pathname.toLowerCase();
  if (/\b(annual|sustainability|esg|investor|report)\b/.test(path)) return "public_report";
  if (/\b(news|press|media)\b/.test(path)) return "news";
  return "other";
}
