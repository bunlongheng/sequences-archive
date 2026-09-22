import { ImageResponse } from "next/og";
import { Resvg } from "@resvg/resvg-js";
import { join } from "node:path";
import db from "@/lib/db";
import { parse, buildSvg, DEFAULT_OPTS, DEFAULT_LAYOUT } from "@/lib/svg-renderer";
import type { Opts, Layout } from "@/lib/svg-renderer";

export const runtime = "nodejs";

// Roboto matches the diagram font; bundled (see outputFileTracingIncludes) so
// resvg renders text on serverless, where no system fonts exist.
const FONT_FILES = ["Roboto-Regular.ttf", "Roboto-Bold.ttf"].map((f) => join(process.cwd(), "lib/fonts", f));
export const dynamic = "force-dynamic";
export const alt = "Diagram preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BG = "linear-gradient(135deg,#0f0a1e 0%,#1d1140 60%,#2e0f6b 100%)";

const Brand = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
    <div style={{ display: "flex", gap: 6 }}>
      <div style={{ width: 22, height: 13, background: "#fb7185", borderRadius: 3 }} />
      <div style={{ width: 22, height: 13, background: "#a78bfa", borderRadius: 3 }} />
      <div style={{ width: 22, height: 13, background: "#34d399", borderRadius: 3 }} />
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1, color: "rgba(255,255,255,0.92)" }}>Sequences</div>
  </div>
);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let svg: string | null = null;
  let title = "Diagram";
  if (UUID.test(id)) {
    const { rows } = await db.query("SELECT code, settings, title, created_at FROM sequences WHERE id = $1", [id]);
    if (rows.length && rows[0].code?.trim()) {
      const { code, settings, title: dbTitle, created_at } = rows[0];
      const opts: Opts = { ...DEFAULT_OPTS, ...(settings?.opts ?? {}), autoLayout: true };
      const layout: Layout = { ...DEFAULT_LAYOUT, ...(settings?.layout ?? {}) };
      const diagram = parse(code);
      if (!diagram.title && dbTitle) diagram.title = dbTitle;
      title = diagram.title || dbTitle || "Diagram";
      svg = buildSvg(diagram, opts, layout, created_at ?? undefined);
    }
  }

  if (!svg) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BG, alignItems: "center", justifyContent: "center", gap: 24 }}>
          <Brand />
          <div style={{ display: "flex", fontSize: 38, color: "rgba(255,255,255,0.6)" }}>Diagram not found</div>
        </div>
      ),
      { ...size }
    );
  }

  const m = svg.match(/width="([\d.]+)"\s+height="([\d.]+)"/);
  const W = m ? parseFloat(m[1]) : 800;
  const H = m ? parseFloat(m[2]) : 450;
  // Fit the diagram into the white card's inner area, preserving aspect ratio.
  const boxW = 1072, boxH = 408;
  const scale = Math.min(boxW / W, boxH / H, 1.6);
  const dw = Math.round(W * scale), dh = Math.round(H * scale);
  // resvg rasterizes the SVG to PNG with the bundled Roboto font so text labels
  // render on serverless; fall back to the raw SVG (shapes only) if resvg fails.
  let dataUri: string;
  try {
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: dw }, font: { fontFiles: FONT_FILES, defaultFontFamily: "Roboto", loadSystemFonts: false } });
    const png = resvg.render().asPng();
    dataUri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } catch {
    dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
  const shown = title.length > 54 ? title.slice(0, 51) + "..." : title;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BG, padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", fontSize: shown.length > 34 ? 38 : 48, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1.1, maxWidth: 860 }}>{shown}</div>
          <Brand />
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: 24, padding: 24, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri} width={dw} height={dh} alt="" />
        </div>
      </div>
    ),
    { ...size }
  );
}
