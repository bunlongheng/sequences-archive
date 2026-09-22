import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { uniqueSequenceSlug } from "@/lib/slugs";
import { resolveOwnerId } from "@/lib/auth-owner";
import { requestOrigin, logApiRequest } from "@/lib/api-log";

// Accepts a bare 11-char video ID or any YouTube URL (watch?v=, youtu.be/,
// /shorts/, /embed/) and returns the canonical video ID, else null.
function extractYouTubeId(input?: string | null): string | null {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// GET /api/sequences — list diagrams for the owner
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveOwnerId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { rows } = await db.query(
      "SELECT id, title, slug, sequence_type, created_at, updated_at, code, tags, settings, settings->>'youtubeId' AS youtube_id FROM sequences WHERE user_id = $1 ORDER BY updated_at DESC",
      [userId]
    );
    return NextResponse.json(rows);
  } catch (err: unknown) {
    console.error("[sequences] GET error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/sequences — save a diagram (owner only)
export async function POST(req: NextRequest) {
  try {
    const isApiCall = !!req.headers.get("authorization")?.trim();
    const userId = await resolveOwnerId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    // `diagramType` is the pre-rename field name; still accepted so existing
    // agents and scripts do not have to be updated in lockstep with the rename.
    const { title, code, tags, youtubeId, youtubeUrl } = body;
    const sequenceType = body.sequenceType ?? body.diagramType;
    if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
    if (!code?.trim()) return NextResponse.json({ error: "code is required" }, { status: 400 });

    // YouTube automations post titles prefixed with "YT:". Strip the prefix and
    // file them under a "YouTube" tag; all other automations get "Automations".
    // The "YT:" prefix is the source marker, never stored in the title itself.
    const ytId = extractYouTubeId(youtubeId ?? youtubeUrl);
    const isYouTube = isApiCall && (/^YT:\s*/i.test(title) || !!ytId);
    const cleanTitle = title.replace(/^YT:\s*/i, "").trim() || "Untitled";

    const slug = await uniqueSequenceSlug(userId, cleanTitle);

    // Automation/API integrations never get to set their own tags — caller tags
    // are honored only for the owner's own UI requests (no Authorization header).
    const finalTags = isApiCall ? (isYouTube ? ["YouTube"] : ["Automations"]) : (tags ?? []);
    const settings = ytId ? JSON.stringify({ youtubeId: ytId }) : null;
    const { rows, rowCount } = await db.query(
      "INSERT INTO sequences (user_id, title, slug, code, sequence_type, tags, settings) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::jsonb) RETURNING *",
      [userId, cleanTitle, slug, code, sequenceType, finalTags, settings]
    );

    if (rowCount === 0) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

    // Programmatic callers get their provenance logged; the owner's own UI saves
    // do not, so the log stays a record of API traffic rather than of editing.
    if (isApiCall) {
      await logApiRequest({
        ...requestOrigin(req),
        route: "/api/sequences",
        status: 200,
        sequenceId: rows[0].id,
        title: rows[0].title,
      });
    }
    return NextResponse.json(rows[0]);
  } catch (err: unknown) {
    console.error("[sequences] POST error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
