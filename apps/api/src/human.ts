/**
 * QA-F11 local fixture verifier. NOT real anti-bot protection or production authentication.
 * Only the production server's Cloudflare Siteverify response can attest a hostname/action.
 */
export interface HumanVerification {
  readonly ok: boolean;
  readonly hostname?: string;
  readonly action?: string;
}

const LOCAL_TOKEN = /^local:([a-z0-9.-]{3,253})(?::([a-zA-Z0-9_-]{8,128}))?$/;

export function localHumanToken(hostname: string, nonce: string): string {
  if (!/^[a-z0-9.-]{3,253}$/.test(hostname) || !/^[a-zA-Z0-9_-]{8,128}$/.test(nonce)) {
    throw new Error("invalid local test token");
  }
  return `local:${hostname}:${nonce}`;
}

export async function verifyLocalHuman(token: string | undefined): Promise<HumanVerification> {
  const parsed = typeof token === "string" ? LOCAL_TOKEN.exec(token) : null;
  return parsed ? { ok: true, hostname: parsed[1]!, action: "booking" } : { ok: false };
}


/** Development CORS origins are never enabled for non-local runtime modes. */
export function devOriginsForEnvironment(nodeEnv: string | undefined, allowed: string | undefined): readonly string[] {
  if (nodeEnv !== "development" && nodeEnv !== "test") return [];
  return (allowed ?? "http://localhost:4321").split(",").filter(Boolean);
}
