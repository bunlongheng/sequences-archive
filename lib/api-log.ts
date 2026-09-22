import db from "@/lib/db";

// Provenance for one programmatic request: where it came from and which
// credential opened the door. The secret itself is NEVER recorded - only the
// env var name that matched, so a leaked key can be identified and revoked.
export type ApiOrigin = {
  ip: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
  referer: string | null;
  origin: string | null;
  keyLabel: string | null;
};

// Same order as bearerOk in lib/auth-owner: primary pair first, then the two
// generations of legacy aliases.
const SECRET_ENVS = [
  "SEQUENCES_API_SECRET", "SEQUENCES_API_SECRET_PARTNER",
  "DIAGRAMS_API_SECRET", "DIAGRAMS_API_SECRET_PARTNER",
  "AI_API_SECRET", "AI_API_SECRET_PARTNER",
] as const;

function header(req: Request, name: string): string | null {
  const v = req.headers.get(name)?.trim();
  return v ? v.slice(0, 500) : null;
}

// Behind Vercel the client IP is the FIRST entry of x-forwarded-for; the later
// entries are proxies. x-real-ip is the local-dev / Caddy fallback.
function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || null;
}

// Which accepted key the Authorization header matched, by env var NAME. Plain
// comparison is fine here: bearerOk has already done the constant-time check
// that decides access - this only labels an already-authorized request.
function keyLabel(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return auth ? "unknown" : null;
  for (const name of SECRET_ENVS) {
    const secret = process.env[name];
    if (secret && auth === `Bearer ${secret}`) return name;
  }
  return "unknown";
}

export function requestOrigin(req: Request): ApiOrigin {
  return {
    ip: clientIp(req),
    country: header(req, "x-vercel-ip-country"),
    city: header(req, "x-vercel-ip-city"),
    userAgent: header(req, "user-agent"),
    referer: header(req, "referer"),
    origin: header(req, "origin"),
    keyLabel: keyLabel(req),
  };
}

// Fire-and-forget audit write. A logging failure must never fail the request
// that was otherwise served, so every error is swallowed after a console line.
export async function logApiRequest(entry: ApiOrigin & {
  route: string;
  method?: string;
  status: number;
  sequenceId?: string | null;
  title?: string | null;
  bytes?: number | null;
}): Promise<void> {
  try {
    await db.query(
      `INSERT INTO sequence_api_requests
         (route, method, status, sequence_id, key_label, ip, country, city, user_agent, referer, origin, title, bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entry.route, entry.method ?? "POST", entry.status, entry.sequenceId ?? null,
        entry.keyLabel, entry.ip, entry.country, entry.city, entry.userAgent,
        entry.referer, entry.origin, entry.title ?? null, entry.bytes ?? null,
      ]
    );
  } catch (err: unknown) {
    console.error("[api-log] write failed:", err instanceof Error ? err.message : String(err));
  }
}
