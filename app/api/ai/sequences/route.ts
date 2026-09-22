import { NextRequest, NextResponse } from "next/server";
import { bearerOk, ownerId } from "@/lib/auth-owner";
import db from "@/lib/db";
import { uniqueSequenceSlug } from "@/lib/slugs";
import { embedTitleInCode } from "@/lib/sequence-code";
import { parse, buildSvg, DEFAULT_OPTS, DEFAULT_LAYOUT } from "@/lib/svg-renderer";
import { requestOrigin, logApiRequest } from "@/lib/api-log";
import type { Opts, Layout } from "@/lib/svg-renderer";

/**
 * POST /api/ai/sequences
 *
 * ONLY sequence diagrams are accepted. Flowcharts, architecture,
 * class, ER, gantt, pie, mindmap, etc. will be rejected with 400.
 *
 * Creates a diagram on behalf of the owner with:
 *   - boxOverlay  = "gloss"
 *   - iconMode    = "icons"
 *
 * Headers:
 *   Authorization: Bearer <SEQUENCES_API_SECRET or SEQUENCES_API_SECRET_PARTNER (legacy: AI_API_SECRET)>
 *
 * Body (JSON):
 *   {
 *     "title":       "My Diagram",          // required
 *     "code":        "sequenceDiagram\n…",  // required
 *     "sequenceType": "sequence",            // optional, defaults to "sequence"
 *     "return":      "svg"                  // optional (or "format": "svg", or ?format=svg)
 *   }
 *
 * Response 201:
 *   {
 *     "id":      "<uuid>",
 *     "url":     "https://sequences-bheng.vercel.app/d/<id>",    // canvas (editable)
 *     "svg_url": "https://sequences-bheng.vercel.app/svg/<id>"   // vector, sharp at any zoom
 *   }
 *
 * With ?format=svg (or body "return"/"format" = "svg") the response ALSO
 * includes "svg": the inline self-contained SVG markup (script-free, safe for
 * Confluence/GitHub/docs). If that render fails, the create still succeeds and
 * "svg_error" carries the message instead of "svg".
 */
export async function POST(req: NextRequest) {
  // Every programmatic call is logged with its provenance - authorized or not -
  // so traffic can be attributed to a caller and throttled later if one runs
  // away. The log write never changes the response.
  const ctx: CreateCtx = { sequenceId: null, title: null };
  let res: NextResponse;
  try {
    res = await postHandler(req, ctx);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/sequences] unhandled error:", msg);
    res = NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
  await logApiRequest({
    ...requestOrigin(req),
    route: "/api/ai/sequences",
    status: res.status,
    sequenceId: ctx.sequenceId,
    title: ctx.title,
  });
  return res;
}

// Carries the created row back out of postHandler for the audit log without
// rewriting its dozen early returns.
type CreateCtx = { sequenceId: string | null; title: string | null };

async function postHandler(req: NextRequest, ctx: CreateCtx) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!process.env.SEQUENCES_API_SECRET && !process.env.SEQUENCES_API_SECRET_PARTNER && !process.env.DIAGRAMS_API_SECRET && !process.env.DIAGRAMS_API_SECRET_PARTNER && !process.env.AI_API_SECRET && !process.env.AI_API_SECRET_PARTNER) {
    return NextResponse.json({ error: "SEQUENCES_API_SECRET not configured" }, { status: 500 });
  }
  if (!bearerOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: { title?: string; code?: string; sequenceType?: string; format?: string; return?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({
      error: "Invalid JSON body",
      instruction: "Send a valid JSON body with Content-Type: application/json. The body MUST include \"title\" and \"code\" fields.",
      required_fields: {
        title: "string — A descriptive name for the diagram (e.g. \"User Authentication Flow\")",
        code: "string — Valid Mermaid sequenceDiagram syntax (must contain \"sequenceDiagram\")",
      },
      optional_fields: {
        sequenceType: "string — Only \"sequence\" is supported (this is the default). Any other value returns 400; the code must contain \"sequenceDiagram\".",
      },
      sample_request: {
        body: {
          title: "User Authentication Flow",
          sequenceType: "sequence",
          code: "---\ntitle: User Authentication Flow\n---\nsequenceDiagram\n  participant U as 🧑 User\n  participant S as ⚙️ Server\n  U->>S: Login Request\n  S-->>U: JWT Token",
        },
      },
    }, { status: 400 });
  }

  const { title, code, sequenceType = "sequence" } = body;

  // ── ONLY sequence diagrams are supported ──────────────────────────────────
  if (sequenceType && sequenceType !== "sequence") {
    return NextResponse.json({
      error: `Unsupported diagram type: "${sequenceType}". This app ONLY supports sequence diagrams.`,
      supported: "sequence",
      rejected: sequenceType,
      hint: "For mindmaps, use POST https://mindmaps-bheng.vercel.app/api/ai/mindmaps. For other diagram types, this app is not the right tool.",
    }, { status: 400 });
  }

  // Also reject code that isn't a sequence diagram
  if (code?.trim() && !/sequenceDiagram/i.test(code)) {
    return NextResponse.json({
      error: "Only sequenceDiagram code is accepted. The code must contain 'sequenceDiagram'.",
      hint: "Flowcharts, architecture diagrams, class diagrams, etc. are NOT supported. Only Mermaid sequenceDiagram syntax.",
      sample_code: "---\ntitle: My Flow\n---\nsequenceDiagram\n  participant U as 🧑 User\n  participant S as ⚙️ Server\n  U->>S: Request\n  S-->>U: Response",
    }, { status: 400 });
  }

  if (!title?.trim()) return NextResponse.json({
    error: "Missing required field: title",
    instruction: "You MUST include a \"title\" field in your JSON body. The title describes what the diagram is about.",
    supported_type: "sequence ONLY — no flowcharts, architecture, class, ER, gantt, pie, or mindmap diagrams",
    required_fields: {
      title: "string — A descriptive name for the diagram (e.g. \"User Authentication Flow\")",
      code: "string — Valid Mermaid sequenceDiagram syntax ONLY",
    },
    sample_request: {
      method: "POST",
      url: "/api/ai/sequences",
      headers: {
        "Authorization": "Bearer <YOUR_API_SECRET>",
        "Content-Type": "application/json",
      },
      body: {
        title: "User Authentication Flow",
        sequenceType: "sequence",
        code: "---\ntitle: User Authentication Flow\n---\nsequenceDiagram\n  participant U as 🧑 User\n  participant S as ⚙️ Server\n  U->>S: Login Request\n  S-->>U: JWT Token",
      },
    },
  }, { status: 400 });

  if (!code?.trim()) return NextResponse.json({
    error: "Missing required field: code",
    instruction: "You MUST include a \"code\" field containing valid Mermaid sequenceDiagram syntax. No other diagram types.",
    sample_request: {
      body: {
        title: "User Authentication Flow",
        sequenceType: "sequence",
        code: "---\ntitle: User Authentication Flow\n---\nsequenceDiagram\n  participant U as 🧑 User\n  participant S as ⚙️ Server\n  U->>S: Login Request\n  S-->>U: JWT Token",
      },
    },
  }, { status: 400 });

  // ── Resolve owner user_id (legacy owner UUID via OWNER_USER_ID) ─────────
  const ownerUserId = ownerId();
  if (!ownerUserId) {
    return NextResponse.json({ error: "OWNER_USER_ID not configured" }, { status: 500 });
  }

  // ── Unique slug ───────────────────────────────────────────────────────────
  const slug = await uniqueSequenceSlug(ownerUserId, title);

  // ── Ensure title is embedded in the code ────────────────────────────────
  const finalCode = embedTitleInCode(code, title);

  // ── Insert ────────────────────────────────────────────────────────────────
  // vPad: 50 gives breathing room between pills so API-rendered SVGs never
  // overlap, regardless of message-text or pill heights.
  const settings = {
    opts: {
      boxOverlay: "gloss",
      iconMode: "icons" as const,
    },
    layout: {
      vPad: 50,
    },
  };

  const { rows } = await db.query(
    "INSERT INTO sequences (user_id, title, slug, code, sequence_type, tags, settings) VALUES ($1, $2, $3, $4, $5, $6::text[], $7) RETURNING *",
    [ownerUserId, title.trim(), slug, finalCode, sequenceType, ["API"], JSON.stringify(settings)]
  );

  if (rows.length === 0) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  const diagram = rows[0];
  ctx.sequenceId = diagram.id;
  ctx.title = diagram.title;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sequences-bheng.vercel.app";
  const response: { id: string; url: string; svg_url: string; svg?: string; svg_error?: string } = {
    id: diagram.id,
    url: `${baseUrl}/d/${diagram.id}`,
    svg_url: `${baseUrl}/svg/${diagram.id}`,
  };

  // ── Optional inline SVG (?format=svg, "return": "svg", or "format": "svg") ─
  // Same renderer as /svg/<id>, but script-free (interactive: false) so the
  // markup survives Confluence/GitHub. A render failure NEVER fails the create:
  // the 201 still returns with svg_error instead of svg.
  const wantsSvg = req.nextUrl.searchParams.get("format") === "svg" || body.return === "svg" || body.format === "svg";
  if (wantsSvg) {
    try {
      const opts: Opts = { ...DEFAULT_OPTS, ...settings.opts };
      const layout: Layout = { ...DEFAULT_LAYOUT, ...settings.layout };
      const parsed = parse(finalCode);
      if (!parsed.title) parsed.title = title.trim();
      response.svg = buildSvg(parsed, opts, layout, diagram.created_at, { interactive: false });
    } catch (renderErr: unknown) {
      response.svg_error = renderErr instanceof Error ? renderErr.message : String(renderErr);
    }
  }

  return NextResponse.json(response, { status: 201 });
}
