import { NextResponse } from "next/server";
import db from "@/lib/db";
import { parse, buildSvg, DEFAULT_OPTS, DEFAULT_LAYOUT } from "@/lib/svg-renderer";
import type { Opts, Layout } from "@/lib/svg-renderer";

export const dynamic = "force-dynamic";

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "diagram";
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { rows } = await db.query("SELECT code, settings, title, created_at FROM sequences WHERE id = $1", [id]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { code, settings, title, created_at } = rows[0];
  if (!code?.trim()) return NextResponse.json({ error: "No code" }, { status: 400 });

  // Compact, like the editor: autoLayout is forced on for every public render
  // so /svg/<id>, the landing tiles, the index previews and a README embed all
  // show the same diagram the owner sees when they open it. A stored layout may
  // predate the current auto layout or have been tuned for a diagram that has
  // since changed; the stored values stay in the row either way.
  const opts: Opts = { ...DEFAULT_OPTS, ...(settings?.opts ?? {}), autoLayout: true };
  const layout: Layout = { ...DEFAULT_LAYOUT, ...(settings?.layout ?? {}) };

  let svg: string;
  try {
    const diagram = parse(code);
    if (!diagram.title && title) diagram.title = title;
    // ?title=0 for surfaces that print the title beside the render (gallery
    // tiles, index cards) - without it every tile shows its title twice.
    const titleBlock = req.url ? new URL(req.url).searchParams.get("title") !== "0" : true;
    svg = buildSvg(diagram, opts, layout, created_at, { titleBlock });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[svg] render failed:", msg);
    return NextResponse.json({ error: "Render failed", detail: msg }, { status: 500 });
  }
  const filename = `${toSlug(title || "diagram")}.svg`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
