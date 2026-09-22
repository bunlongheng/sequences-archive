"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { signOut as nextAuthSignOut } from "next-auth/react";
import { CuteToast, showToast } from "@/app/CuteToast";
import { Bot, Plug, Briefcase, User as UserIcon, FlaskConical, Clipboard, GraduationCap, Lightbulb, Rocket, Star, Heart, Tag, Youtube } from "lucide-react";
import { relativeTime, buildTagColorMap, TAG_PALETTE } from "@/lib/editor-logic";
import { PAL, THEMES, stripFrontmatter, detectSequenceType, parse, buildSvg, DEFAULT_OPTS, DEFAULT_LAYOUT } from "@/lib/svg-renderer";
import type { Opts, Layout } from "@/lib/svg-renderer";
import { fireflies } from "./fireflies";
import Wordmark from "./Wordmark";
import { DEMO_IDS } from "@/lib/demo-ids";

// Shape the shell passes in: NextAuth session user mapped to the fields this
// component reads.
export type ShellUser = {
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
};

type Sequence = {
  id: string; title: string; slug: string;
  sequence_type: string; created_at: string; updated_at: string; code: string;
  tags: string[];
  youtube_id?: string | null;
  settings?: { opts?: Partial<Opts>; layout?: Partial<Layout> } | null;
};

// ── Shared (public) ───────────────────────────────────────────────────────────
const LS_SHARED = "sequence:shared";
// How many previews are rendered up front, before mount. 12 covers 3 rows of
// the 4-across grid on a desktop screen, so nothing visible arrives as a
// placeholder that later swaps.
const EAGER_PREVIEWS = 12;

const LS_VIEW = "sequence:view"; // "grid" (default, thumbnails) | "list"

// These keys were renamed with the app (diagram* -> sequence*). A browser that
// used the app before the rename still holds its values under the old names, so
// read through to them once and migrate the value forward. Without this the
// rename silently wipes the cached Google avatar, the shared set, and the saved
// view mode - the avatar cache being the one that restored the header photo.
const LEGACY_LS: Record<string, string> = {
  [LS_SHARED]: "diagram:shared",
  [LS_VIEW]: "diagram:view",
  sequences_user_cache: "diagrams_user_cache",
};

function lsGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
    const legacy = LEGACY_LS[key] ? localStorage.getItem(LEGACY_LS[key]) : null;
    if (legacy !== null) {
      localStorage.setItem(key, legacy);
      localStorage.removeItem(LEGACY_LS[key]);
      return legacy;
    }
  } catch { /* storage blocked (private mode) - treat as empty */ }
  return null;
}
function loadShared(): Set<string> {
  try { return new Set(JSON.parse(lsGet(LS_SHARED) ?? "[]")); } catch { return new Set(); }
}

// ── Card preview: the real diagram ───────────────────────────────────────────
// Same renderer and same saved settings as the editor and /svg/<id>, so the
// card shows the diagram itself, not a sketch of it. The root width/height are
// swapped for 100% so the viewBox scales it to whatever width the card has,
// letterboxed inside a 2:1 box on the theme's own background. Anything that is
// not a sequenceDiagram, or fails to parse, keeps the sketch minimap.
// Previews render with titleBlock: false, which drops the locale-formatted
// created_at - the one thing in the SVG that differed between a UTC server and
// the viewer's browser. Verified byte-identical across timezones, so the first
// screenful can be server-rendered: it is in the HTML, correct on first paint,
// with no swap from a placeholder.
//
// Everything past that screenful waits for mount, which keeps the HTML small on
// a library of 180. `eager` decides which side of that line a preview is on.
// The return is 3-state: "pending" (not rendered yet), null (cannot render this
// type), or the markup.
function useSequenceSvg(d: Sequence, eager: boolean) {
  const [ready, setReady] = useState(eager);
  useEffect(() => { if (!ready) setReady(true); }, [ready]);
  return useMemo((): { svg: string; bg: string } | null | "pending" => {
    if (!ready) return "pending";
    if (detectSequenceType(d.code) !== "sequence") return null;
    try {
      const parsed = parse(d.code);
      if (!parsed.title && d.title) parsed.title = d.title;
      const opts: Opts = { ...DEFAULT_OPTS, ...(d.settings?.opts ?? {}), autoLayout: true };
      const layout: Layout = { ...DEFAULT_LAYOUT, ...(d.settings?.layout ?? {}) };
      const svg = buildSvg(parsed, opts, layout, d.created_at, { interactive: false, titleBlock: false })
        .replace(/ width="[\d.]+" height="[\d.]+" viewBox=/, ' width="100%" height="100%" viewBox=');
      return { svg, bg: THEMES[opts.theme]?.bg ?? "#ffffff" };
    } catch { return null; }
  }, [ready, d.code, d.title, d.settings, d.created_at]);
}

function SequencePreview({ d, eager }: { d: Sequence; eager: boolean }) {
  const preview = useSequenceSvg(d, eager);
  // A pending preview holds its space quietly instead of drawing the sketch and
  // then swapping - that swap is what read as the wrong icon glitching.
  if (preview === "pending") return <div style={{ width: "100%", aspectRatio: "2 / 1", borderRadius: 8, background: "#fafbfc", border: "1px solid #eceef0" }} />;
  if (!preview) return <SequenceMinimap code={d.code} type={d.sequence_type} />;
  return (
    <div style={{ width: "100%", aspectRatio: "2 / 1", borderRadius: 8, overflow: "hidden", background: preview.bg, border: "1px solid #eceef0" }}
      dangerouslySetInnerHTML={{ __html: preview.svg }} />
  );
}

// Row thumbnail: the same render at tile size. Too small to read, but the shape
// of a diagram is recognizable and it is the diagram, not a letter. A
// non-sequence falls back to the coloured letter tile the rows always had.
function SequenceRowThumb({ d, eager }: { d: Sequence; eager: boolean }) {
  const preview = useSequenceSvg(d, eager);
  const c = colorFor(d.title || "");
  if (preview === "pending") return <div style={{ width: 92, height: 50, borderRadius: 8, background: "#fafbfc", border: "1px solid #eceef0", flexShrink: 0 }} />;
  if (!preview) return (
    <div style={{ width: 92, height: 50, borderRadius: 8, background: tint(c, 0.14), border: `1px solid ${tint(c, 0.28)}`, color: c, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {letterFor(d.title || "")}
    </div>
  );
  return (
    <div aria-hidden style={{ width: 92, height: 50, borderRadius: 8, overflow: "hidden", background: preview.bg, border: "1px solid #eceef0", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: preview.svg }} />
  );
}

// ── Sequence minimap ───────────────────────────────────────────────────────────
function SequenceMinimap({ code, type }: { code: string; type: string }) {
  const W = 224, H = 112;
  // Strip YAML frontmatter (---...---) before parsing - shared with lib/svg-renderer
  const stripped = stripFrontmatter(code);
  const rawLines = stripped.split("\n");
  const lines = rawLines.map(l => l.trim()).filter(l => l && !l.startsWith("%%"));
  // Always detect type from code - stored sequence_type in DB can be stale
  const detected = detectSequenceType(code);
  const detectedType = detected === "sequence" ? "sequence"
    : detected === "flowchart" ? "flowchart"
    : type;
  const svgStyle: React.CSSProperties = { display: "block", background: "#ffffff", borderRadius: 8 };

  // ── Sequence - show ALL participants, exact colors matching editor ───────────
  if (detectedType === "sequence") {
    const seen = new Map<string, string>();
    for (const line of lines) {
      const asM = line.match(/^(?:participant|actor)\s+(\S+)\s+as\s+(.+)$/i);
      const idM = line.match(/^(?:participant|actor)\s+(\S+)/i);
      if (asM) seen.set(asM[1], asM[2].trim().replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, "").slice(0, 4));
      else if (idM && !idM[1].match(/^(sequenceDiagram|autonumber)$/i)) seen.set(idM[1], idM[1].slice(0, 4));
    }
    if (seen.size === 0) {
      for (const line of lines) {
        const m = line.match(/^(\S+)\s*(?:-->>|->>|-->|-x|->)\s*(\S+)\s*:/);
        if (m) { if (!seen.has(m[1])) seen.set(m[1], m[1].slice(0, 4)); if (!seen.has(m[2])) seen.set(m[2], m[2].slice(0, 4)); }
      }
    }
    const participants = [...seen.keys()]; // no cap - show ALL
    const n = participants.length;
    if (n === 0) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    // slot = equal share of width per participant; box fills 60% of slot, gap is 40%
    const slot = W / n;
    const BOX_W = Math.min(28, slot * 0.6);
    const BOX_H = Math.max(5, Math.min(11, BOX_W * 0.38));
    const xs = participants.map((_, i) => slot * i + slot / 2);
    const colors = participants.map((_, i) => PAL[i % PAL.length]);
    const TOP_Y = 4;
    const BOT_Y = H - BOX_H - 4;
    const LIFE_TOP = TOP_Y + BOX_H + 1;
    const LIFE_BOT = BOT_Y - 1;
    const LIFE_MID = (LIFE_TOP + LIFE_BOT) / 2;
    const numSize = Math.max(5, Math.min(8, BOX_W * 0.55));
    const msgs: { fi: number; ti: number }[] = [];
    for (const line of lines) {
      const m = line.match(/^(\S+)\s*(?:-->>|->>|-->|-x|->)\s*(\S+)\s*:/);
      if (m) { const fi = participants.indexOf(m[1]), ti = participants.indexOf(m[2]); if (fi >= 0 && ti >= 0 && fi !== ti) msgs.push({ fi, ti }); }
    }
    const maxM = Math.min(msgs.length, 8);
    const msgGap = maxM > 0 ? (LIFE_BOT - LIFE_TOP - 4) / maxM : 0;
    const arrowW = n > 6 ? 0.7 : 1;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {/* lifelines - two segments so they skip around the circle */}
        {xs.map((x, i) => {
          const r = numSize * 0.9 + 1.5; // gap slightly larger than circle radius
          return (
            <g key={`ll${i}`}>
              <line x1={x} y1={LIFE_TOP} x2={x} y2={LIFE_MID - r} stroke={colors[i]} strokeWidth={0.8} opacity={0.5} />
              <line x1={x} y1={LIFE_MID + r} x2={x} y2={LIFE_BOT} stroke={colors[i]} strokeWidth={0.8} opacity={0.5} />
            </g>
          );
        })}
        {/* top boxes */}
        {xs.map((x, i) => (
          <rect key={`pt${i}`} x={x - BOX_W / 2} y={TOP_Y} width={BOX_W} height={BOX_H} rx={2} fill={colors[i]} />
        ))}
        {/* bottom boxes */}
        {xs.map((x, i) => (
          <rect key={`pb${i}`} x={x - BOX_W / 2} y={BOT_Y} width={BOX_W} height={BOX_H} rx={2} fill={colors[i]} />
        ))}
        {/* sequence number in a circle on lifeline midpoint */}
        {xs.map((x, i) => {
          const r = numSize * 0.9;
          return (
            <g key={`n${i}`}>
              <circle cx={x} cy={LIFE_MID} r={r} fill={colors[i]} fillOpacity={0.18} stroke={colors[i]} strokeWidth={0.8} strokeOpacity={0.7} />
              <text x={x} y={LIFE_MID + numSize * 0.35} textAnchor="middle" fill={colors[i]} fontSize={numSize} fontWeight="700" fontFamily="system-ui,sans-serif" opacity={0.9}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Flowchart / Graph ────────────────────────────────────────────────────────
  if (detectedType === "flowchart" || detectedType === "graph") {
    const nodeMap = new Map<string, string>();
    const edgeList: [string, string][] = [];
    for (const line of lines) {
      for (const m of [...line.matchAll(/\b([A-Za-z0-9_]+)\s*[\[\(\{]([^\]\)\}]{1,20})[\]\)\}]/g)]) {
        if (!["graph","flowchart","subgraph","end"].includes(m[1].toLowerCase())) nodeMap.set(m[1], m[2].replace(/["']/g,"").trim().slice(0,6));
      }
      const em = line.match(/([A-Za-z0-9_]+)\s*(?:-->|---|--[^>]*>|-\.-?>|==+>)\s*([A-Za-z0-9_]+)/);
      if (em) { if (!nodeMap.has(em[1])) nodeMap.set(em[1], em[1].slice(0,4)); if (!nodeMap.has(em[2])) nodeMap.set(em[2], em[2].slice(0,4)); edgeList.push([em[1], em[2]]); }
    }
    const nodeIds = [...nodeMap.keys()].slice(0, 8);
    if (nodeIds.length === 0) return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle}>
        {PAL.slice(0,5).map((c,i) => <circle key={i} cx={W/2+(i-2)*22} cy={H/2} r={9} fill={c} opacity={0.6} />)}
      </svg>
    );
    const childMap = new Map<string, string[]>();
    edgeList.forEach(([f,t]) => { if (!childMap.has(f)) childMap.set(f,[]); childMap.get(f)!.push(t); });
    const hasParent = new Set(edgeList.map(([,t]) => t));
    const roots = nodeIds.filter(id => !hasParent.has(id));
    if (roots.length === 0) roots.push(nodeIds[0]);
    const layers: string[][] = [];
    const visited = new Set<string>();
    let q = [...new Set(roots)].slice(0, 4);
    while (q.length && layers.length < 4) {
      const layer = q.filter(id => !visited.has(id)).slice(0,4);
      if (!layer.length) break;
      layers.push(layer); layer.forEach(id => visited.add(id));
      const nxt: string[] = [];
      layer.forEach(id => (childMap.get(id) ?? []).filter(c => !visited.has(c)).forEach(c => nxt.push(c)));
      q = [...new Set(nxt)];
    }
    nodeIds.filter(id => !visited.has(id)).forEach(id => { if ((layers[layers.length-1]?.length ?? 4) < 4) layers[layers.length-1].push(id); else layers.push([id]); });
    const positions = new Map<string, [number, number]>();
    layers.forEach((layer, li) => {
      const y = 20 + li * ((H - 30) / Math.max(layers.length - 1, 1));
      layer.forEach((id, ni) => positions.set(id, [(W * (ni + 1)) / (layer.length + 1), y]));
    });
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {edgeList.slice(0,12).map(([f,t], i) => { const fp=positions.get(f), tp=positions.get(t); if (!fp||!tp) return null; return <line key={`e${i}`} x1={fp[0]} y1={fp[1]} x2={tp[0]} y2={tp[1]} stroke="#d1d5db" strokeWidth={1.5} />; })}
        {[...positions.entries()].map(([id,[x,y]], i) => (
          <g key={`n${i}`}>
            <rect x={x-18} y={y-10} width={36} height={20} rx={4} fill={PAL[i % PAL.length]} />
            </g>
        ))}
      </svg>
    );
  }

  // ── Mindmap ──────────────────────────────────────────────────────────────────
  if (type === "mindmap") {
    const indents: [number, string][] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("%%") || /^mindmap$/i.test(trimmed)) continue;
      indents.push([line.length - line.trimStart().length, trimmed.replace(/[`"'()[\]{}]/g,"").trim()]);
    }
    if (!indents.length) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const rootIndent = indents[0][0], rootLabel = indents[0][1].slice(0,7);
    // Detect actual child indent level (first indent strictly greater than root)
    let childIndent = rootIndent + 2;
    for (let i = 1; i < indents.length; i++) {
      if (indents[i][0] > rootIndent) { childIndent = indents[i][0]; break; }
    }
    const children: string[] = [];
    const gcMap = new Map<number, string[]>();
    let lastIdx = -1;
    for (let i = 1; i < indents.length; i++) {
      const [ind, txt] = indents[i];
      if (!txt) continue;
      if (ind === childIndent) { children.push(txt.slice(0,6)); lastIdx = children.length - 1; }
      else if (ind > childIndent && lastIdx >= 0) { if (!gcMap.has(lastIdx)) gcMap.set(lastIdx,[]); const a=gcMap.get(lastIdx)!; if (a.length<2) a.push(txt.slice(0,5)); }
    }
    // Tree layout: root at top-center, children spread across middle row, grandchildren below
    const n = Math.min(children.length, 6);
    const ROOT_X = W / 2, ROOT_Y = 14, ROOT_R = 14;
    const CHILD_Y = 55, CHILD_R = 9;
    const GC_Y = 92, GC_R = 6;
    const childXs = Array.from({length: n}, (_, i) => n === 1 ? W/2 : 18 + i * ((W - 36) / Math.max(n - 1, 1)));
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {childXs.map((x, i) => {
          const color = PAL[i % PAL.length];
          const gc = gcMap.get(i) ?? [];
          const gcCount = Math.min(gc.length, 2);
          const gcXs = gcCount === 1 ? [x] : gcCount === 2 ? [x - 14, x + 14] : [];
          return (
            <g key={`ch${i}`}>
              <line x1={ROOT_X} y1={ROOT_Y + ROOT_R} x2={x} y2={CHILD_Y - CHILD_R} stroke={color} strokeWidth={1.5} opacity={0.5} />
              {gcXs.map((gx, j) => (
                <g key={j}>
                  <line x1={x} y1={CHILD_Y + CHILD_R} x2={gx} y2={GC_Y - GC_R} stroke={color} strokeWidth={1} opacity={0.4} />
                  <circle cx={gx} cy={GC_Y} r={GC_R} fill={color} opacity={0.5} />
                </g>
              ))}
              <circle cx={x} cy={CHILD_Y} r={CHILD_R} fill={color} />
            </g>
          );
        })}
        <circle cx={ROOT_X} cy={ROOT_Y} r={ROOT_R} fill="#1e293b" />
      </svg>
    );
  }

  // ── Pie ──────────────────────────────────────────────────────────────────────
  if (type === "pie") {
    const slices: [number, string][] = [];
    for (const line of lines) { const m=line.match(/^\s*"([^"]+)"\s*:\s*([\d.]+)/); if (m) slices.push([parseFloat(m[2]), m[1].slice(0,8)]); }
    const total = slices.reduce((s,[v]) => s+v, 0);
    if (!total) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const cx=W/2, cy=H/2, r=Math.min(W,H)*0.38;
    let sa = -Math.PI/2;
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {slices.slice(0,8).map(([v],i) => {
          const sweep=(v/total)*2*Math.PI, ea=sa+sweep;
          const x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);
          const d=`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep>Math.PI?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
          sa=ea; return <path key={i} d={d} fill={PAL[i%PAL.length]} stroke="#fff" strokeWidth={1.5} />;
        })}
      </svg>
    );
  }

  // ── Class / ER ────────────────────────────────────────────────────────────────
  if (type === "class" || type === "er") {
    const names: string[] = [];
    const rels: [string, string][] = [];
    for (const line of lines) {
      const nm = type==="class" ? line.match(/^class\s+(\w+)/) : line.match(/^([A-Z][A-Z0-9_]+)\s*\{/);
      if (nm && !names.includes(nm[1])) names.push(nm[1]);
      const rm = line.match(/(\w+)\s*(?:--|<\|--|\|\|--|o\{--|-->|\.\.>)\s*(\w+)/);
      if (rm) rels.push([rm[1], rm[2]]);
    }
    const n = Math.min(names.length, 6);
    if (!n) return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={svgStyle} />;
    const cols=n<=3?n:Math.ceil(n/2), rows=Math.ceil(n/cols);
    const padX=20, padY=18, cellW=(W-2*padX)/cols, cellH=(H-2*padY)/rows;
    const positions = new Map<string,[number,number]>();
    names.slice(0,n).forEach((name,i) => positions.set(name,[padX+(i%cols)*cellW+cellW/2, padY+Math.floor(i/cols)*cellH+cellH/2]));
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {rels.slice(0,8).map(([f,t],i) => { const fp=positions.get(f),tp=positions.get(t); if (!fp||!tp) return null; return <line key={`r${i}`} x1={fp[0]} y1={fp[1]} x2={tp[0]} y2={tp[1]} stroke="#d1d5db" strokeWidth={1.5} />; })}
        {[...positions.entries()].map(([name,[x,y]],i) => (
          <g key={`e${i}`}>
            <rect x={x-22} y={y-12} width={44} height={24} rx={4} fill={PAL[i%PAL.length]} />
            </g>
        ))}
      </svg>
    );
  }

  // ── Gantt ─────────────────────────────────────────────────────────────────────
  if (type === "gantt") {
    const sections: { name: string; tasks: number }[] = [];
    let cur="", tc=0;
    for (const line of lines) {
      const sm=line.match(/^section\s+(.+)/i);
      if (sm) { if (cur) sections.push({name:cur,tasks:Math.max(tc,1)}); cur=sm[1].trim(); tc=0; }
      else if (line.includes(":") && !line.match(/^(gantt|title|dateFormat|axisFormat|excludes)/i)) tc++;
    }
    if (cur||tc>0) sections.push({name:cur||"Tasks",tasks:Math.max(tc,1)});
    if (!sections.length) sections.push({name:"Tasks",tasks:3});
    const n=Math.min(sections.length,5), totalT=sections.slice(0,n).reduce((s,sec)=>s+sec.tasks,0);
    const rowH=(H-16)/n, barH=Math.min(14,rowH-6);
    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
        {sections.slice(0,n).map((sec,i) => {
          const y=10+i*rowH+(rowH-barH)/2, barW=Math.max(16,(sec.tasks/totalT)*(W-44)), offset=Math.round((i/(Math.max(n-1,1)))*18);
          return (
            <g key={i}>
              <text x={27} y={y+barH*0.68} textAnchor="end" fill="#9ca3af" fontSize={7}>{sec.name.slice(0,5)}</text>
              <rect x={30+offset} y={y} width={barW} height={barH} rx={3} fill={PAL[i%PAL.length]} opacity={0.8} />
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Generic / GitGraph / Journey - horizontal connected boxes ────────────────
  const count = Math.min(Math.max(lines.length, 3), 5);
  const gap = 8, boxH = 22, boxW = (W - (count + 1) * gap) / count;
  const by = H / 2 - boxH / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={svgStyle}>
      {Array.from({length: count - 1}, (_, i) => {
        const x1 = gap + i * (boxW + gap) + boxW, x2 = gap + (i + 1) * (boxW + gap);
        return (
          <g key={`a${i}`}>
            <line x1={x1} y1={H/2} x2={x2 - 4} y2={H/2} stroke="#cbd5e1" strokeWidth={1.5} />
            <polygon points={`${x2-4},${H/2-3} ${x2},${H/2} ${x2-4},${H/2+3}`} fill="#cbd5e1" />
          </g>
        );
      })}
      {Array.from({length: count}, (_, i) => (
        <rect key={i} x={gap + i * (boxW + gap)} y={by} width={boxW} height={boxH} rx={4} fill={PAL[i % PAL.length]} />
      ))}
    </svg>
  );
}

// ── YouTube thumbnail ───────────────────────────────────────────────────────────
// Shown instead of the diagram minimap for YouTube automations (tag "YouTube").
function YouTubeThumb({ id, title }: { id: string; title: string }) {
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "2 / 1", borderRadius: 8, overflow: "hidden", background: "#000" }}>
      <Image
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt={title}
        fill
        sizes="224px"
        style={{ objectFit: "cover" }}
      />
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ width: 34, height: 24, borderRadius: 6, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="#fff"><polygon points="8 5 19 12 8 19 8 5" /></svg>
        </span>
      </span>
    </div>
  );
}

// ── AI Thinking animation ─────────────────────────────────────────────────────
const AI_TOKENS = [
  "tokens","context","embedding","inference","neural","attention","transformer",
  "gradient","weight","latent","vector","semantic","entropy","logit","softmax",
  "decode","encode","tensor","backprop","synapse","neuron","pattern","classify",
  "predict","generate","reason","analyze","parse","query","memory","chain",
  "cluster","feature","kernel","dropout","sigmoid","relu","normalize","sample",
  "prompt","stream","output","input","layer","epoch","batch","loss","node",
  "graph","recursion",
];
const AI_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>/\\|{}[]";
const PARTICLE_COLORS = [
  "#f87171","#fb923c","#fbbf24","#34d399","#38bdf8","#818cf8","#e879f9",
  "#f472b6","#a3e635","#2dd4bf","#60a5fa","#c084fc",
];
function pickToken() {
  return Math.random() < 0.35
    ? AI_TOKENS[Math.floor(Math.random() * AI_TOKENS.length)]
    : AI_CHARS[Math.floor(Math.random() * AI_CHARS.length)];
}
const LOADING_PHRASES = [
  "Thinking…","Tokenizing…","Building graph…","Reasoning…","Encoding…",
  "Mapping flow…","Inferring…","Generating…","Assembling…","Almost there…",
];

function AIThinkingOverlay({ onCancel }: { onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    // Respect reduced-motion preference - render a single static frame, no rAF loop
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ctx.fillStyle = "rgba(8,8,16,0.94)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.min(W * 0.08, 56)}px system-ui,sans-serif`;
      ctx.fillText("Generating…", W / 2, H / 2);
      return;
    }

    // Floating background particles
    const particles = Array.from({ length: 100 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      text: pickToken(),
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      alpha: Math.random() * 0.4 + 0.08,
      size: Math.floor(Math.random() * 8) + 9,
      tickNext: Math.floor(Math.random() * 50),
      isWord: Math.random() < 0.35,
    }));

    // One huge center word, fades in/out and cycles
    const AI_WORDS = ["context","generate","sequence","diagram","tokens","model","prompt","neural","embed","parse","encode","chain","batch","infer","weight","layer","tensor","epoch","dropout","cluster","feature","semantic","attention","gradient","dataset","output","latent","vector","pipeline","deploy"];
    let centerWord = AI_WORDS[Math.floor(Math.random() * AI_WORDS.length)];
    let centerAlpha = 0;
    let centerFading = true; // true = fading in
    let centerTimer = 0;
    const FADE_SPEED = 0.022;
    const HOLD_FRAMES = 90;

    let t = 0;
    let phraseIdx = 0;
    let phraseTimer = 0;

    const draw = () => {
      t++;
      phraseTimer++;
      centerTimer++;
      if (phraseTimer > 80) { phraseTimer = 0; phraseIdx = (phraseIdx + 1) % LOADING_PHRASES.length; }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,8,16,0.94)";
      ctx.fillRect(0, 0, W, H);

      // ── One huge white center word ──
      if (centerFading) {
        centerAlpha = Math.min(1, centerAlpha + FADE_SPEED);
        if (centerAlpha >= 1) { centerFading = false; centerTimer = 0; }
      } else if (centerTimer > HOLD_FRAMES) {
        centerAlpha = Math.max(0, centerAlpha - FADE_SPEED);
        if (centerAlpha <= 0) {
          centerWord = AI_WORDS[Math.floor(Math.random() * AI_WORDS.length)];
          centerFading = true; centerTimer = 0;
        }
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = centerAlpha;
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.min(W * 0.13, 120)}px system-ui,sans-serif`;
      ctx.fillText(centerWord, W / 2, H / 2);
      ctx.globalAlpha = 1;
      ctx.textBaseline = "alphabetic";

      // floating tokens + chars - avoid center zone
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        if (--p.tickNext <= 0) {
          p.text = pickToken();
          p.isWord = p.text.length > 1;
          p.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
          p.tickNext = Math.floor(Math.random() * 70) + 25;
        }
        const dist = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (dist < 160) continue;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.font = `${p.isWord ? "700" : "400"} ${p.size}px monospace`;
        ctx.textAlign = "left";
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // rotating phrase - bottom center
      const phrase = LOADING_PHRASES[phraseIdx];
      ctx.font = "500 13px system-ui,sans-serif";
      ctx.fillStyle = `rgba(160,170,220,0.8)`;
      ctx.textAlign = "center";
      ctx.fillText(phrase, W / 2, H - 48);

      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 2000, display: "block" }} />
      <button onClick={onCancel} aria-label="Cancel generation" style={{
        position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 2001,
        padding: "9px 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)",
        background: "rgba(255,255,255,0.08)", color: "#e8eaf8", fontSize: 13, fontWeight: 600,
        fontFamily: "inherit", cursor: "pointer", backdropFilter: "blur(8px)",
      }}>Cancel</button>
    </>
  );
}

// ── AI Prompt modal ────────────────────────────────────────────────────────────
function AIPromptModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: Sequence) => void }) {
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timedOutRef = useRef(false);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Abort any in-flight generation on unmount (e.g. modal closed some other way)
  useEffect(() => () => abortRef.current?.abort(), []);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    setThinking(false);
  }, []);

  const submit = async () => {
    if (!prompt.trim() || thinking) return;
    setThinking(true);
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    const timeoutId = setTimeout(() => { timedOutRef.current = true; controller.abort(); }, 60000);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? "Generation failed", { color: "#ef4444" }); setThinking(false); return; }
      onCreated(data);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        if (timedOutRef.current) showToast("Generation timed out", { color: "#ef4444" });
      } else {
        showToast("Network error", { color: "#ef4444" });
      }
      setThinking(false);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  if (thinking) return <AIThinkingOverlay onCancel={cancelGeneration} />;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 20, padding: "32px 32px 28px", width: 520, maxWidth: "92vw", boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1c1e21", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: 0 }}>Generate with AI</h3>
            <p style={{ fontSize: 12, color: "#8a8d91", margin: 0 }}>Describe your sequence and Claude will build it</p>
          </div>
        </div>
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); if (e.key === "Escape") onClose(); }}
          placeholder="e.g. OAuth 2.0 login flow between user, frontend, and auth server…"
          rows={4}
          style={{ width: "100%", padding: "12px 14px", fontSize: 14, border: "1.5px solid #e4e6e8", borderRadius: 12, outline: "none", fontFamily: "inherit", resize: "none", color: "#1c1e21", background: "#f8f9fa", boxSizing: "border-box", lineHeight: 1.6 }}
        />
        <p style={{ fontSize: 11, color: "#bcc0c4", margin: "8px 0 20px" }}>⌘ + Enter to generate</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", border: "1px solid #e4e6e8", borderRadius: 10, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={submit} disabled={!prompt.trim()} style={{ padding: "10px 24px", background: prompt.trim() ? "#1c1e21" : "#e4e6e8", color: prompt.trim() ? "#fff" : "#8a8d91", border: "none", borderRadius: 10, cursor: prompt.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600, fontFamily: "inherit", transition: "background 0.15s" }}>
            Generate ✦
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tag colors - 12 unique palettes, assigned by sorted position (no duplicates) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TAG_ICONS: Record<string, React.ComponentType<any>> = {
  AI: Bot, API: Plug, Work: Briefcase, Personal: UserIcon,
  Research: FlaskConical, Pasted: Clipboard, Learning: GraduationCap,
  Idea: Lightbulb, Project: Rocket, Favorite: Star, Love: Heart, YouTube: Youtube,
};
function TagIcon({ tag, size = 10 }: { tag: string; size?: number }) {
  const Icon = TAG_ICONS[tag] ?? Tag;
  return <Icon size={size} strokeWidth={2.5} style={{ flexShrink: 0 }} />;
}


// ── Tag modal ─────────────────────────────────────────────────────────────────
const PRESET_TAGS = ["AI", "API", "Work", "Personal", "Research", "Pasted"];
function TagModal({ sequence, onSave, onClose, tagColorMap, allKnownTags }: { sequence: Sequence; onSave: (tags: string[]) => void; onClose: () => void; tagColorMap: Map<string, typeof TAG_PALETTE[0]>; allKnownTags: string[] }) {
  const [tags, setTags] = useState<string[]>(sequence.tags ?? []);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const add = (t: string) => { const v = t.trim(); if (!v || tags.includes(v)) return; setTags(p => [...p, v]); setInput(""); };
  const remove = (t: string) => setTags(p => p.filter(x => x !== t));

  // All selectable options: presets + any existing tags in the system
  const allOptions = useMemo(() => [...new Set([...PRESET_TAGS, ...allKnownTags])].sort(), [allKnownTags]);

  // Local color map - includes new custom tags not yet saved, guaranteed unique
  const localColorMap = useMemo(() => {
    const all = [...new Set([...allOptions, ...tags])].sort();
    return buildTagColorMap(all);
  }, [allOptions, tags]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}
      onKeyDown={e => { if (e.key === "Enter" && !input.trim()) { e.stopPropagation(); onSave(tags); onClose(); } }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px 24px", width: 620, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 4px" }}>Tags</h3>
        <p style={{ fontSize: 12, color: "#8a8d91", margin: "0 0 18px" }}>{sequence.title}</p>

        {/* All tag options */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
          {allOptions.map(t => {
            const active = tags.includes(t);
            const s = localColorMap.get(t) ?? TAG_PALETTE[0];
            return (
              <button key={t} onClick={() => active ? remove(t) : add(t)}
                style={{ padding: "3px 10px 3px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${s.border}`, background: active ? s.border : "#fff", color: s.text, opacity: active ? 1 : 0.55, transition: "all 0.12s", fontFamily: "inherit", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <TagIcon tag={t} size={10} />
                {t}
              </button>
            );
          })}
        </div>

        {/* Custom tag input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") { if (input.trim()) add(input); else { onSave(tags); onClose(); } } if (e.key === "Escape") onClose(); }}
            placeholder="Custom tag…"
            style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: "1.5px solid #e4e6e8", borderRadius: 9, outline: "none", fontFamily: "inherit", color: "#1c1e21", background: "#f8f9fa" }} />
          <button onClick={() => add(input)} style={{ padding: "8px 14px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Add</button>
        </div>

        {/* Selected tags with remove */}
        {tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {tags.map(t => { const s = localColorMap.get(t) ?? TAG_PALETTE[0]; return (
              <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text, border: `1.5px solid ${s.border}` }}>
                {t}
                <button onClick={() => remove(t)} title={`Remove ${t}`} aria-label={`Remove ${t}`}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: s.text, border: "none", cursor: "pointer", color: "#fff", fontSize: 11, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 1 }}>×</button>
              </span>
            ); })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={() => onSave(tags)} style={{ padding: "9px 22px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Rename modal ──────────────────────────────────────────────────────────────
function RenameModal({ title, onSave, onClose }: { title: string; onSave: (t: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 28px 24px", width: 440, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 16px" }}>Rename Sequence</h3>
        <input
          ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); if (e.key === "Escape") onClose(); }}
          placeholder="Sequence title…"
          style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: "1.5px solid #1c1e21", borderRadius: 10, outline: "none", fontFamily: "inherit", marginBottom: 16, boxSizing: "border-box", color: "#1c1e21", background: "#f4f5f7" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
          <button onClick={() => val.trim() && onSave(val.trim())} style={{ padding: "9px 22px", background: "#1c1e21", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function SequenceCard({ d, isShared, onOpen, onDelete, onRename, onTag, onViewCode, deleting, tagColorMap, isNew, showTags, eager }: {
  d: Sequence; isShared: boolean;
  onOpen: () => void; onDelete: () => void; onRename: () => void; onTag: () => void; onViewCode: () => void;
  deleting: boolean; tagColorMap: Map<string, typeof TAG_PALETTE[0]>; isNew: boolean; showTags: boolean; eager: boolean;
}) {
  const tags = d.tags ?? [];

  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      tabIndex={0}
      role="button"
      aria-label={`Open sequence ${d.title}`}
      data-seq-id={d.id}
      className={`dc-card${isNew ? " dc-new-card" : ""}`}
      // Hover is CSS (.dc-card:hover), not React state. State could miss its
      // mouseleave - a fast move between cards, or a re-render mid-hover - and
      // leave a card stuck looking hovered while another one lit up too. The
      // browser can only ever hover one element, so this cannot desync.
      style={{
        background: "#ffffff",
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        position: "relative",
        ...(isNew ? {
          border: "2px solid #6366f1",
          boxShadow: "0 0 0 3px rgba(99,102,241,0.25), 0 8px 28px rgba(99,102,241,0.15)",
          animation: "dc-blink 0.4s ease-in-out 2",
        } : null),
      }}
    >
      {/* Header */}
      <div style={{ padding: "13px 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1e21", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {d.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isShared && (
            <span title="Public" style={{ fontSize: 9, fontWeight: 600, color: "#65676b", background: "#f0f1f3", border: "1px solid #e4e6e8", borderRadius: 4, padding: "2px 6px" }}>
              Public
            </span>
          )}
          <span style={{ fontSize: 10, color: "#8a8d91" }}>{relativeTime(d.updated_at ?? d.created_at)}</span>
        </div>
      </div>

      {/* Tags - hidden on the "All" view to reduce clutter (edit via the hover Tags button) */}
      {showTags && tags.length > 0 && (
        <div style={{ padding: "0 13px 8px", display: "flex", gap: 4, flexWrap: "wrap" }} role="button" tabIndex={0} aria-label="Edit tags"
          onClick={e => { e.stopPropagation(); onTag(); }}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onTag(); } }}>
          {tags.map(t => { const s = tagColorMap.get(t) ?? TAG_PALETTE[0]; return (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px 1px 4px", borderRadius: 20, background: s.bg, color: s.text, border: `1px solid ${s.border}`, cursor: "pointer", letterSpacing: "0.02em", lineHeight: 1.4, display: "inline-flex", alignItems: "center", gap: 3 }}><TagIcon tag={t} size={9} />{t}</span>
          ); })}
        </div>
      )}

      {/* Preview - YouTube thumbnail for YouTube automations, else diagram minimap */}
      <div style={{ padding: "0 12px 13px" }}>
        {d.youtube_id
          ? <YouTubeThumb id={d.youtube_id} title={d.title} />
          : <SequencePreview d={d} eager={eager} />}
      </div>

      {/* Actions - visible on hover or keyboard focus (:focus-within), always mounted so Tab can reach them */}
      <div className="dc-card-actions" style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
        <button onClick={onRename} title="Rename" aria-label="Rename sequence"
          style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
        </button>
        <button onClick={onViewCode} title="View code" aria-label="View code"
          style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
        </button>
        <button onClick={onTag} title="Tags" aria-label="Edit tags"
          style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.3-7.3a1 1 0 0 0 0-1.41L12 2z"/><circle cx="7" cy="7" r="1.5" fill="#8a8d91"/>
          </svg>
        </button>
        <button onClick={onDelete} title="Delete" aria-label="Delete sequence" disabled={deleting}
          style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", opacity: deleting ? 0.5 : 1 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Sequence list row (compact "list" view) ───────────────────────────────────
const rowActionBtn = { width: 28, height: 28, borderRadius: 7, border: "1px solid #e4e6e8", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flexShrink: 0 } as const;

// Dynamic letter tile: first letter of the title, colored deterministically from
// the title (PAL palette) so every diagram gets a stable, distinct chip.
const LETTER_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#84cc16", "#0891b2"];
function letterFor(title: string) { const m = (title || "").match(/[a-z0-9]/i); return m ? m[0].toUpperCase() : "#"; }
function colorFor(title: string) { let h = 0; for (let i = 0; i < title.length; i++) h = (Math.imul(h, 31) + title.charCodeAt(i)) >>> 0; return LETTER_COLORS[h % LETTER_COLORS.length]; }
function tint(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function DiagramRow({ d, isShared, onOpen, onDelete, onRename, onTag, onViewCode, deleting, tagColorMap, isNew, showTags, eager }: {
  d: Sequence; isShared: boolean;
  onOpen: () => void; onDelete: () => void; onRename: () => void; onTag: () => void; onViewCode: () => void;
  deleting: boolean; tagColorMap: Map<string, typeof TAG_PALETTE[0]>; isNew: boolean; showTags: boolean; eager: boolean;
}) {
  const tags = d.tags ?? [];
  return (
    <div onClick={onOpen} className="dc-row"
      role="button" tabIndex={0} aria-label={`Open ${d.title}`}
      data-seq-id={d.id}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderBottom: "1px solid #eef0f2", cursor: "pointer", background: isNew ? "#f5f3ff" : undefined }}>
      {/* The diagram itself at tile size; a letter tile when it is not a sequence */}
      <SequenceRowThumb d={d} eager={eager} />
      {/* Title + meta (tiered) */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1c1e21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
        <div style={{ fontSize: 11.5, color: "#9aa0a6", marginTop: 1 }}>{d.sequence_type || "sequence"} · {relativeTime(d.updated_at ?? d.created_at)}</div>
      </div>
      {/* Tags - only when a specific tag filter is active */}
      {showTags && tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => { e.stopPropagation(); onTag(); }}>
          {tags.slice(0, 3).map(t => { const s = tagColorMap.get(t) ?? TAG_PALETTE[0]; return (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px 1px 4px", borderRadius: 20, background: s.bg, color: s.text, border: `1px solid ${s.border}`, display: "inline-flex", alignItems: "center", gap: 3 }}><TagIcon tag={t} size={9} />{t}</span>
          ); })}
        </div>
      )}
      {isShared && <span style={{ fontSize: 9, fontWeight: 600, color: "#65676b", background: "#f0f1f3", border: "1px solid #e4e6e8", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>Public</span>}
      {/* Actions on hover */}
      <div className="dc-row-actions" style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={onRename} title="Rename" aria-label="Rename" style={rowActionBtn}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
        <button onClick={onViewCode} title="View code" aria-label="View code" style={rowActionBtn}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        </button>
        <button onClick={onTag} title="Tags" aria-label="Edit tags" style={rowActionBtn}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l7.3-7.3a1 1 0 0 0 0-1.41L12 2z"/><circle cx="7" cy="7" r="1.5" fill="#8a8d91"/></svg>
        </button>
        <button onClick={onDelete} title="Delete" aria-label="Delete" disabled={deleting} style={{ ...rowActionBtn, opacity: deleting ? 0.5 : 1 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── Avatar cache ──────────────────────────────────────────────────────────────
const LS_KEY = "sequences_user_cache"; // last known Google profile photo URL

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SequencesClient({ user, sequences: initial }: { user: ShellUser; sequences: Sequence[] }) {
  const [sequences, setSequences] = useState(initial);
  useEffect(() => { setSequences(initial); }, [initial]);

  const [shared] = useState<Set<string>>(loadShared);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newCardId, setNewCardId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [search, setSearch] = useState("");
  // Seeded from the session so the photo is in the server HTML (no post-hydration flash).
  const [avatarSrc, setAvatarSrc] = useState<string | null>(
    user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null
  );
  const [renamingSequence, setRenamingSequence] = useState<Sequence | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [taggingSequence, setTaggingSequence] = useState<Sequence | null>(null);
  const [codeSequence, setCodeSequence] = useState<Sequence | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // Scope: the owner's own library, or the curated public demo lineup.
  const [scope, setScope] = useState<"personal" | "demo">("personal");

  // View mode: "grid" thumbnails by default, "list" when the browser saved it.
  // The saved value is read in an effect, not in the initializer: the server
  // has no localStorage, so an initializer that reads it renders different HTML
  // on the 2 sides and React discards the tree (this was the standing hydration
  // error on the index). Start at the default on both sides, then correct.
  const [view, setView] = useState<"list" | "grid">("grid");
  useEffect(() => { if (lsGet(LS_VIEW) === "list") setView("list"); }, []);
  const changeView = (v: "list" | "grid") => { setView(v); try { localStorage.setItem(LS_VIEW, v); } catch {} };
  const menuRef = useRef<HTMLDivElement>(null);

  const handleAICreated = useCallback((d: Sequence) => {
    setShowAIPrompt(false);
    // Redirect straight to the diagram
    window.location.href = `/?id=${d.id}&imported=1`;
  }, []);
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "";

  // Google photo from the session, cached so it paints instantly on the next
  // load (and survives the client path where getSession() has no image).
  useEffect(() => {
    const liveUrl = user.user_metadata?.avatar_url ?? user.user_metadata?.picture;
    if (liveUrl) {
      setAvatarSrc(liveUrl);
      try { localStorage.setItem(LS_KEY, liveUrl); } catch {}
      return;
    }
    const cached = lsGet(LS_KEY);
    if (cached) setAvatarSrc(cached);
  }, [user]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Realtime AI-diagram notifications were removed with the auth migration.
  // (Could be restored later via Pusher.)

  // ── Global paste - save new record + open in editor ───────────────────────
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const pasted = e.clipboardData?.getData("text") ?? "";
      if (!pasted.trim()) return;
      const body = stripFrontmatter(pasted.trim());
      const looksLikeSequence = /^sequenceDiagram/im.test(body);
      if (!looksLikeSequence) return;
      e.preventDefault();
      showToast("Sequence detected - opening editor…", { color: "#1c1e21" });

      const titleMatch = pasted.match(/^\s*(?:title|accTitle):?\s+(.+)$/im);
      const title = titleMatch ? titleMatch[1].trim() : "Untitled";
      const dtype = detectSequenceType(pasted);

      let savedId: string | null = null;
      try {
        const res = await fetch("/api/sequences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, code: pasted, sequenceType: dtype, tags: ["Pasted"] }),
        });
        if (res.ok) {
          const data = await res.json();
          savedId = data?.id ?? null;
        }
      } catch { /* navigate anyway */ }

      window.location.href = savedId ? `/?id=${savedId}&imported=1` : `/?new`;
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [user]);

  async function saveTitle(id: string, newTitle: string) {
    const sequence = sequences.find(d => d.id === id);
    // Also patch the title: line inside the code so the rendered diagram stays in sync
    const newCode = sequence?.code
      ? sequence.code.replace(/^((?:title|accTitle):[ \t]*)(.*)$/m, `$1${newTitle}`)
      : null;
    const codeChanged = newCode && newCode !== sequence?.code;
    await fetch(`/api/sequences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle, ...(codeChanged ? { code: newCode } : {}) }),
    });
    setSequences(prev => prev.map(d => d.id === id ? { ...d, title: newTitle, ...(codeChanged ? { code: newCode! } : {}) } : d));
    setRenamingSequence(null);
  }

  async function saveTags(id: string, tags: string[]) {
    const res = await fetch(`/api/sequences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); showToast(`Failed to save tags: ${e.error ?? "Unknown error"}`, { color: "#ef4444" }); return; }
    setSequences(prev => prev.map(d => d.id === id ? { ...d, tags } : d));
    setTaggingSequence(null);
    showToast(tags.length ? `Tags saved: ${tags.join(", ")}` : "Tags cleared", { color: "#1c1e21" });
  }

  function signOut() {
    const farewells = ["Later!","See ya!","Peace out!","Catch you later!","Adios!","So long!","Bye for now!","Take care!","Until next time!"];
    const msg = farewells[Math.floor(Math.random() * farewells.length)];
    nextAuthSignOut({ redirect: false }).then(() => {
      localStorage.removeItem(LS_KEY);
      showToast(msg);
      setTimeout(() => window.location.reload(), 1800);
    });
  }

  function openInEditor(d: Sequence) { window.location.href = `/?id=${d.id}`; }

  async function deleteDiagram(id: string) {
    setConfirmDeleteId(null);
    setDeleting(id);
    const res = await fetch(`/api/sequences/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      showToast(`Delete failed: ${e.error ?? "Unknown error"}`, { color: "#ef4444" });
      setDeleting(null); return;
    }
    showToast("Deleted ✓", { color: "#64748b" });
    // Read the card's box BEFORE React drops it from the list, then let the
    // fireflies take its place - once it is unmounted there is nothing to
    // measure and the swarm would land in the top-left corner.
    fireflies(document.querySelector(`[data-seq-id="${id}"]`));
    setSequences(prev => prev.filter(d => d.id !== id));
    setDeleting(null);
  }

  // A diagram on the demo lineup belongs to Demo, not Personal - otherwise the
  // same 7 appear in both scopes and the personal count double-counts them.
  const demoIdSet = useMemo(() => new Set<string>(DEMO_IDS), []);
  const personalSequences = useMemo(() => sequences.filter(d => !demoIdSet.has(d.id)), [sequences, demoIdSet]);

  // Tag vocabulary is personal-only: a tag on a demo diagram is not a filter
  // the owner's library should offer.
  const rawTags = useMemo(() => [...new Set(personalSequences.flatMap(d => d.tags ?? []))], [personalSequences]);
  const [tagOrder, setTagOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("tag-order") ?? "[]"); } catch { return []; }
  });
  const allTags = useMemo(() => {
    const set = new Set(rawTags);
    const ordered = tagOrder.filter(t => set.has(t));
    const rest = rawTags.filter(t => !ordered.includes(t)).sort();
    return [...ordered, ...rest];
  }, [rawTags, tagOrder]);

  const dragTag = useRef<string | null>(null);
  function onTagDragStart(t: string) { dragTag.current = t; }
  function onTagDragOver(e: React.DragEvent, t: string) {
    e.preventDefault();
    if (!dragTag.current || dragTag.current === t) return;
    setTagOrder(prev => {
      const base = allTags.filter(x => prev.includes(x) || rawTags.includes(x));
      const next = [...new Set(base)];
      const from = next.indexOf(dragTag.current!);
      const to = next.indexOf(t);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, dragTag.current!);
      localStorage.setItem("tag-order", JSON.stringify(next));
      return next;
    });
  }

  const tagColorMap = useMemo(() => buildTagColorMap(allTags), [allTags]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    personalSequences.forEach(d => (d.tags ?? []).forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return m;
  }, [personalSequences]);

  // Demo scope: exactly the curated public lineup, in its published order, so
  // reviewing it here is reviewing what a logged-out visitor sees at /demo.
  const demoSequences = useMemo(() => {
    const byId = new Map(sequences.map(d => [d.id, d]));
    return DEMO_IDS.map(id => byId.get(id)).filter((d): d is Sequence => !!d);
  }, [sequences]);

  const filtered = (scope === "demo" ? demoSequences : personalSequences).filter(d => {
    if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.sequence_type.toLowerCase().includes(search.toLowerCase())) return false;
    // Demo is the published lineup and nothing else: no tag filtering, so the
    // scope always shows every diagram a visitor would see.
    if (scope === "demo") return true;
    if (activeTag === "__no_tag__") return (d.tags ?? []).length === 0;
    if (activeTag) return (d.tags ?? []).includes(activeTag);
    // "All" view excludes YouTube automations - clean list; view them via the YouTube tab.
    return !(d.tags ?? []).includes("YouTube");
  });

  const byUpdated = (a: Sequence, b: Sequence) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at);
  // Demo keeps its curated order; personal sorts by most recently touched.
  const allSequences = scope === "demo" ? filtered : filtered.sort(byUpdated);

  const cardProps = (d: Sequence) => ({
    d, isShared: shared.has(d.id),
    onOpen: () => openInEditor(d),
    onDelete: () => setConfirmDeleteId(d.id),
    onRename: () => setRenamingSequence(d),
    onTag: () => setTaggingSequence(d),
    onViewCode: () => setCodeSequence(d),
    deleting: deleting === d.id,
    tagColorMap,
    isNew: newCardId === d.id,
    // On the "All" view the tags are just noise across every card - hide them there;
    // show them when a specific tag filter is active.
    showTags: activeTag !== null,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", fontFamily: "var(--font-roboto), system-ui, sans-serif" }}>
      <CuteToast />
      <style>{`
        @keyframes dc-blink {
          0%   { opacity: 1; }
          40%  { opacity: 0.25; }
          100% { opacity: 1; }
        }
        .dc-new-card { animation: dc-blink 0.45s ease-in-out 2; }
        .dc-card { border: 2px solid transparent; box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s; }
        .dc-card:hover { border-color: #1c1e21; box-shadow: 0 8px 28px rgba(0,0,0,0.18), 0 0 0 3px rgba(28,30,33,0.08); transform: translateY(-2px); }
        .dc-row { background: #ffffff; transition: background 0.1s; }
        .dc-row:hover { background: #f7f8fa; }
        .dc-row-actions { opacity: 0; pointer-events: none; transition: opacity 0.1s; }
        .dc-row:hover .dc-row-actions, .dc-row:focus-within .dc-row-actions { opacity: 1; pointer-events: auto; }
        .dc-grid { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 1100px) { .dc-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 820px) { .dc-grid { grid-template-columns: repeat(2, 1fr); } }
        .dc-card-actions { opacity: 0; pointer-events: none; transition: opacity 0.12s; }
        .dc-card:hover .dc-card-actions,
        .dc-card:focus-within .dc-card-actions { opacity: 1; pointer-events: auto; }
        @media (max-width: 640px) {
          .dc-header { padding: 0 16px !important; }
          .dc-filterbar { padding: 0 16px !important; }
          .dc-search-wrap { flex: 1 !important; width: auto !important; min-width: 0 !important; }
          .dc-search-wrap input { width: 100% !important; }
          .dc-main { padding: 20px 16px 100px !important; }
          .dc-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="dc-header" style={{ background: "#ffffff", borderBottom: "1px solid #e4e6e8", height: 56, position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 32px", height: "100%", display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Wordmark size={32} priority />
        </div>

        <div style={{ flex: 1 }} />

        {/* Avatar */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(v => !v)} aria-label="Account menu"
            style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", border: showMenu ? "2px solid #1c1e21" : "2px solid #e4e6e8", cursor: "pointer", padding: 0, background: "#e4e6e8", transition: "border-color 0.15s", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", userSelect: "none" }}>{name[0]?.toUpperCase()}</span>
            {avatarSrc && <img src={avatarSrc} alt="" referrerPolicy="no-referrer" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={() => { setAvatarSrc(null); try { localStorage.removeItem(LS_KEY); } catch {} }} />}
          </button>
          {showMenu && (
            <div style={{ position: "absolute", top: 42, right: 0, width: 210, background: "#ffffff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #e4e6e8", overflow: "hidden", zIndex: 50 }}>
              <div style={{ padding: "14px 16px 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1e21", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                <div style={{ fontSize: 11, color: "#8a8d91", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{user.email}</div>
              </div>
              <div style={{ height: 1, background: "#f0f1f3" }} />
              <button onClick={() => { setShowDocs(true); setShowMenu(false); }}
                style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1c1e21", fontFamily: "inherit", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f4f5f7")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                <span style={{ fontSize: 14 }}>📋</span> Import formats
              </button>
              <div style={{ height: 1, background: "#f0f1f3" }} />
              <button onClick={signOut}
                style={{ width: "100%", padding: "11px 16px", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#dc2626", fontFamily: "inherit", fontWeight: 500 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>Sign out</button>
            </div>
          )}
        </div>
      </div></header>

      {/* ── Demo bar ── Demo has no concept of tags, but the strip stays so the
           content below keeps its vertical position when the scope changes. It
           carries the one thing that is true there: the whole lineup, always. */}
      {scope === "demo" && (
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e4e6e8", height: 40 }}>
          <div className="dc-filterbar" style={{ maxWidth: 1600, margin: "0 auto", padding: "0 32px", height: "100%", boxSizing: "border-box" }}>
            <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, border: "1.5px solid #1c1e21", background: "#1c1e21", color: "#fff", flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                All <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{demoSequences.length}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag filter bar ── */}
      {scope === "personal" && allTags.length > 0 && (
        <div style={{ background: "#ffffff", borderBottom: "1px solid #e4e6e8", height: 40 }}>
        <div className="dc-filterbar" style={{ maxWidth: 1600, margin: "0 auto", padding: "0 32px", height: "100%", boxSizing: "border-box" }}>
          <div style={{ height: "100%", display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
          <button onClick={() => setActiveTag(null)}
            style={{ padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${!activeTag ? "#1c1e21" : "#e4e6e8"}`, background: !activeTag ? "#1c1e21" : "#f4f5f7", color: !activeTag ? "#fff" : "#65676b", flexShrink: 0, transition: "all 0.12s", display: "flex", alignItems: "center", gap: 5 }}>
            All <span style={{ background: !activeTag ? "rgba(255,255,255,0.25)" : "#e4e6e8", borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{personalSequences.filter(d => !(d.tags ?? []).includes("YouTube")).length}</span>
          </button>
          {allTags.map(t => { const s = tagColorMap.get(t)!; const active = activeTag === t; const count = tagCounts.get(t) ?? 0; return (
            <button key={t} onClick={() => setActiveTag(active ? null : t)}
              draggable onDragStart={() => onTagDragStart(t)} onDragOver={e => onTagDragOver(e, t)} onDragEnd={() => { dragTag.current = null; }}
              style={{ padding: "3px 10px 3px 7px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${s.border}`, background: active ? s.border : "#fff", color: s.text, flexShrink: 0, transition: "all 0.15s", opacity: active ? 1 : 0.65, display: "flex", alignItems: "center", gap: 4 }}>
              <TagIcon tag={t} size={10} />
              {t} <span style={{ background: active ? "rgba(255,255,255,0.25)" : `${s.text}22`, borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{count}</span>
            </button>
          ); })}
          <button onClick={() => setActiveTag(activeTag === "__no_tag__" ? null : "__no_tag__")}
            style={{ padding: "3px 10px 3px 7px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1.5px solid #d1d5db`, background: activeTag === "__no_tag__" ? "#d1d5db" : "#fff", color: "#65676b", flexShrink: 0, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
            <Tag size={10} strokeWidth={2.5} style={{ flexShrink: 0 }} />
            No Tag <span style={{ background: activeTag === "__no_tag__" ? "rgba(255,255,255,0.25)" : "#e4e6e8", borderRadius: 20, padding: "0 5px", fontSize: 10 }}>{personalSequences.filter(d => (d.tags ?? []).length === 0).length}</span>
          </button>
          </div>
        </div></div>
      )}

      {/* ── Content ── */}
      <main className="dc-main" style={{ padding: "32px 32px 100px", maxWidth: 1600, margin: "0 auto" }}>

        {filtered.length === 0 && (
          <div style={{ position: "fixed", inset: 0, top: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", background: "#f4f5f7", zIndex: 0 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "#e4e6e8", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8a8d91" strokeWidth={1.5} strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>
            </div>
            <p style={{ fontSize: 14, color: "#1c1e21", fontWeight: 600, margin: 0 }}>{search ? "No sequences found" : "No sequences yet"}</p>
            <p style={{ fontSize: 13, color: "#8a8d91", marginTop: 6 }}>{search ? "Try a different search" : "Paste diagram code to get started"}</p>
          </div>
        )}

        {/* Toolbar: count + search + list/grid toggle. Rendered even with 0
            results - the search box lives here now, so hiding it would leave no
            way to clear a search that matched nothing. */}
        <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 2, background: "#eceef1", borderRadius: 9, padding: 3, flexShrink: 0 }}>
                  {([["personal", "Personal"], ["demo", "Demo"]] as const).map(([v, label]) => {
                    const on = scope === v;
                    return (
                      <button key={v} onClick={() => setScope(v)} aria-pressed={on}
                        style={{ padding: "4px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.01em",
                          background: on ? "#ffffff" : "transparent", color: on ? "#1c1e21" : "#9aa0a6",
                          boxShadow: on ? "0 1px 3px rgba(0,0,0,0.14)" : "none", transition: "all 0.12s" }}>
                        {label}{v === "demo" ? ` ${demoSequences.length}` : ""}
                      </button>
                    );
                  })}
                </div>
                {/* Demo's count is already on the tab and in the All pill above;
                    only a missing lineup id is worth saying here. */}
                <span style={{ fontSize: 12.5, color: "#8a8d91", fontWeight: 500, flexShrink: 0 }}>
                  {scope === "demo"
                    ? (demoSequences.length < DEMO_IDS.length ? `${DEMO_IDS.length - demoSequences.length} of ${DEMO_IDS.length} missing` : "")
                    : `${allSequences.length} diagram${allSequences.length === 1 ? "" : "s"}`}
                </span>
                {/* Opens the real /demo route rather than imitating it here.
                    That page reads no session - verified byte-identical with and
                    without a session cookie - so what opens is exactly the page
                    a stranger gets, not a preview of it. */}
                {scope === "demo" && (
                  <a href="/demo" target="_blank" rel="noreferrer"
                    title="Opens the real public page - it renders the same for everyone"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, textDecoration: "none",
                      fontSize: 12, fontWeight: 700, color: "#1c1e21", background: "#ffffff",
                      border: "1px solid #e4e6e8", borderRadius: 8, padding: "5px 11px",
                      boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
                    View as visitor
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              {/* Search */}
              <div className="dc-search-wrap" style={{ position: "relative", width: 300 }}>
                <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8a8d91" }} width={13} height={13} viewBox="0 0 20 20" fill="none">
                  <circle cx={9} cy={9} r={6} stroke="currentColor" strokeWidth={1.8} />
                  <path d="M14 14l3 3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                  style={{ width: "100%", padding: "7px 14px 7px 32px", boxSizing: "border-box", border: "1px solid #e4e6e8", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit", color: "#1c1e21", background: "#ffffff" }} />
              </div>
              <div style={{ display: "flex", gap: 2, background: "#eceef1", borderRadius: 9, padding: 3, flexShrink: 0 }}>
                {([
                  ["list", "List view", <svg key="l" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>],
                  ["grid", "Thumbnail view", <svg key="g" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>],
                ] as const).map(([v, label, icon]) => {
                  const on = view === v;
                  return (
                    <button key={v} onClick={() => changeView(v)} title={label} aria-label={label} aria-pressed={on}
                      style={{ width: 32, height: 27, borderRadius: 7, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: on ? "#ffffff" : "transparent", color: on ? "#1c1e21" : "#9aa0a6", boxShadow: on ? "0 1px 3px rgba(0,0,0,0.14)" : "none", transition: "all 0.12s" }}>
                      {icon}
                    </button>
                  );
                })}
              </div>
              </div>
            </div>

            {allSequences.length > 0 && (view === "grid" ? (
              <div className="dc-grid" style={{ display: "grid", gap: 14 }}>
                {/* The first screenful renders server-side; the rest fill in after
                    mount, so a 180-diagram library does not ship as one huge page. */}
                {allSequences.map((d, i) => <SequenceCard key={d.id} {...cardProps(d)} eager={i < EAGER_PREVIEWS} />)}
              </div>
            ) : (
              <div style={{ background: "#ffffff", border: "1px solid #e4e6e8", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
                {allSequences.map((d, i) => <DiagramRow key={d.id} {...cardProps(d)} eager={i < EAGER_PREVIEWS} />)}
              </div>
            ))}
        </section>
      </main>

      {/* ── FAB ── */}
      <button onClick={() => setShowAIPrompt(true)} title="Generate with AI" aria-label="Generate with AI"
        style={{ position: "fixed", bottom: 32, right: 32, width: 52, height: 52, borderRadius: "50%", background: "#1c1e21", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", border: "none", cursor: "pointer", fontSize: 24, color: "#fff", transition: "transform 0.15s, box-shadow 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(0,0,0,0.4)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
      >✦</button>

      {showAIPrompt && <AIPromptModal onClose={() => setShowAIPrompt(false)} onCreated={handleAICreated} />}
      {taggingSequence && <TagModal sequence={taggingSequence} onSave={tags => saveTags(taggingSequence.id, tags)} onClose={() => setTaggingSequence(null)} tagColorMap={tagColorMap} allKnownTags={allTags} />}

      {renamingSequence && (
        <RenameModal
          title={renamingSequence.title}
          onSave={t => saveTitle(renamingSequence.id, t)}
          onClose={() => setRenamingSequence(null)}
        />
      )}

      {confirmDeleteId && (
        <div onClick={() => setConfirmDeleteId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 28px 24px", width: 380, boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: "0 0 8px" }}>Delete diagram?</h3>
            <p style={{ fontSize: 13, color: "#65676b", margin: "0 0 24px", lineHeight: 1.5 }}>This can&apos;t be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "9px 18px", border: "1px solid #e4e6e8", borderRadius: 9, background: "#f4f5f7", cursor: "pointer", fontSize: 13, fontFamily: "inherit", color: "#65676b" }}>Cancel</button>
              <button onClick={() => deleteDiagram(confirmDeleteId)} style={{ padding: "9px 22px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showDocs && (
        <div onClick={() => setShowDocs(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)" }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: "#ffffff", borderRadius: 16, padding: "28px 32px", width: 560, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1c1e21", margin: 0 }}>Import Formats</h2>
              <button onClick={() => setShowDocs(false)} aria-label="Close" style={{ background: "none", border: "none", color: "#8a8d91", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "#65676b", margin: "0 0 20px", lineHeight: 1.6 }}>Three ways to create a diagram. All sequence sequences auto-save on paste; use <kbd style={{ background: "#f4f5f7", border: "1px solid #e4e6e8", borderRadius: 4, padding: "1px 6px", fontSize: 11, color: "#1c1e21" }}>⌘S</kbd> to save edits.</p>
            {[
              { label: "1. Generate with AI", tag: "Built-in", tagColor: "#a855f7", code: `Click the ✦ button on the index page and describe your diagram\nin plain English. Claude generates the Mermaid code and saves\nit to your library automatically.\n\nExample prompt: "OAuth 2.0 login flow between user, frontend,\nand auth server"` },
              { label: "2. Paste (⌘V) anywhere", tag: "Auto-detect", tagColor: "#16a34a", code: `sequenceDiagram\n  participant A as Alice\n  participant B as Bob\n  A->>B: Hello!\n  B-->>A: Hi there` },
              { label: "3. POST via API", tag: "External agents", tagColor: "#6366f1", code: `curl -X POST ${process.env.NEXT_PUBLIC_APP_URL ?? "https://sequences-bheng.vercel.app"}/api/ai/sequences \\\n  -H "Authorization: Bearer $SEQUENCES_API_SECRET" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "title": "My Sequence Title",\n    "sequenceType": "sequence",\n    "code": "---\\ntitle: My Sequence\\n---\\nsequenceDiagram\\n  participant A as 🧑 User\\n  participant B as ⚙️ Server\\n  A->>B: Request\\n  B-->>A: Response"\n  }'` },
            ].map(({ label, tag, tagColor, code }) => (
              <div key={label} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1e21" }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: tagColor, background: `${tagColor}14`, borderRadius: 4, padding: "2px 7px" }}>{tag}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <pre style={{ margin: 0, padding: "12px 14px", background: "#f4f5f7", borderRadius: 8, border: "1px solid #e4e6e8", fontSize: 11, color: "#1c1e21", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", lineHeight: 1.7, overflowX: "auto", whiteSpace: "pre" }}>{code}</pre>
                  <button
                    onClick={() => { navigator.clipboard.writeText(code); setCopiedLabel(label); setTimeout(() => setCopiedLabel(null), 2000); }}
                    style={{ position: "absolute", top: 8, right: 8, background: copiedLabel === label ? "#22c55e" : "#ffffff", border: "1px solid #e4e6e8", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: copiedLabel === label ? "#ffffff" : "#65676b", cursor: "pointer", transition: "all 0.15s" }}
                  >{copiedLabel === label ? "Copied!" : "Copy"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Code slide-in panel (from left) ── */}
      {codeSequence && (
        <div onClick={() => { setCodeSequence(null); setCodeCopied(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 1000, backdropFilter: "blur(4px)" }}>
          <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 420, maxWidth: "90vw",
            background: "#ffffff", boxShadow: "8px 0 32px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column",
            animation: "dc-slide-left 0.2s ease-out",
          }}>
            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #e4e6e8", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#1c1e21" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1e21", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{codeSequence.title}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(codeSequence.code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                style={{ background: codeCopied ? "#22c55e" : "#f4f5f7", border: "1px solid #e4e6e8", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: codeCopied ? "#fff" : "#65676b", cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}
              >{codeCopied ? "Copied!" : "Copy"}</button>
              <button onClick={() => { setCodeSequence(null); setCodeCopied(false); }} aria-label="Close" style={{ background: "none", border: "none", color: "#8a8d91", cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>
            {/* Code */}
            <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
              <pre style={{
                margin: 0, padding: "16px 20px", fontSize: 12, lineHeight: 1.75, color: "#1c1e21",
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{codeSequence.code}</pre>
            </div>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { display: none; }
        @keyframes dc-slide-left {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
