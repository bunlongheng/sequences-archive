// Pure SVG-rendering functions — no DOM, runs on client and server

export interface Participant { id: string; label: string; color: string }
export type Arrow = "solid" | "dashed";
export interface SeqMsg { from: string; to: string; text: string; arrow: Arrow; step: number; seqPos: number; displayStep?: number }
export interface SeqNote { participants: string[]; text: string; position: "over" | "left" | "right"; seqPos: number }
export interface Diagram { participants: Participant[]; messages: SeqMsg[]; notes: SeqNote[]; title?: string; totalSteps: number }
export interface Opts { coloredLines: boolean; coloredNumbers: boolean; coloredText: boolean; showNotes: boolean; font: string; lifelineDash: string; theme: string; iconMode: "none" | "icons" | "emoji"; icons: Record<string,string>; boxOverlay: string; autoLayout: boolean; labelOverrides: Record<string,string>; colorOverrides: Record<string,string> }
export interface Layout { stepHeight: number; boxWidth: number; spacing: number; textSize: number; margin: number; vPad: number }

export const DEFAULT_OPTS: Opts = { coloredLines: true, coloredNumbers: true, coloredText: true, showNotes: false, font: "Roboto", lifelineDash: "solid", theme: "light", iconMode: "icons", icons: {}, boxOverlay: "gloss", autoLayout: true, labelOverrides: {}, colorOverrides: {} };
export const DEFAULT_LAYOUT: Layout = { stepHeight: 34, boxWidth: 141, spacing: 250, textSize: 13, margin: 80, vPad: 0 };

export { parse, buildSvg, esc, PAL, PAL_MONOKAI, THEMES, ICON_NODES, guessIconKey, assignIconKeys, renderIcon, computeAutoLayout, detectSequenceType, DEFAULT_DIAGRAM_TITLE, LIFELINE_DASH, DIAGRAM_TYPES, stripFrontmatter };
export type { INode };

const PAL = ["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#f43f5e","#84cc16","#0891b2"];
const PAL_MONOKAI = ["#ab9df2","#78dce8","#a9dc76","#ffd866","#fc9867","#f92672","#ff6da2","#23bbad","#25d9c8","#c678dd"];

type INode = [string, Record<string, string | number>];
const ICON_NODES: Record<string, INode[]> = {
    user:         [["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{cx:12,cy:7,r:4}]],
    bot:          [["path",{d:"M12 8V4H8"}],["rect",{width:16,height:12,x:4,y:8,rx:2}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],
    server:       [["rect",{width:20,height:8,x:2,y:2,rx:2}],["rect",{width:20,height:8,x:2,y:14,rx:2}],["path",{d:"M6 6h.01"}],["path",{d:"M6 18h.01"}]],
    database:     [["ellipse",{cx:12,cy:5,rx:9,ry:3}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{d:"M3 12A9 3 0 0 0 21 12"}]],
    zap:          [["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"}]],
    plug:         [["path",{d:"M12 22v-5"}],["path",{d:"M15 8V2"}],["path",{d:"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"}],["path",{d:"M9 8V2"}]],
    "git-branch": [["path",{d:"M15 6a9 9 0 0 0-9 9V3"}],["circle",{cx:18,cy:6,r:3}],["circle",{cx:6,cy:18,r:3}]],
    globe:        [["circle",{cx:12,cy:12,r:10}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"}],["path",{d:"M2 12h20"}]],
    brain:        [["path",{d:"M12 18V5"}],["path",{d:"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"}],["path",{d:"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"}],["path",{d:"M18 18a4 4 0 0 0 2-7.464"}],["path",{d:"M6 18a4 4 0 0 1-2-7.464"}]],
    settings:     [["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"}],["circle",{cx:12,cy:12,r:3}]],
    folder:       [["path",{d:"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}]],
    cloud:        [["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"}]],
    mail:         [["path",{d:"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"}],["rect",{x:2,y:4,width:20,height:16,rx:2}]],
    lock:         [["rect",{width:18,height:11,x:3,y:11,rx:2}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4"}]],
    key:          [["path",{d:"m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"}],["path",{d:"m21 2-9.6 9.6"}],["circle",{cx:7.5,cy:15.5,r:5.5}]],
    search:       [["path",{d:"m21 21-4.34-4.34"}],["circle",{cx:11,cy:11,r:8}]],
    "chart-bar":  [["path",{d:"M3 3v16a2 2 0 0 0 2 2h16"}],["path",{d:"M7 16h8"}],["path",{d:"M7 11h12"}],["path",{d:"M7 6h3"}]],
    bell:         [["path",{d:"M10.268 21a2 2 0 0 0 3.464 0"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"}]],
    "credit-card":[["rect",{width:20,height:14,x:2,y:5,rx:2}],["path",{d:"M2 10h20"}]],
    smartphone:   [["rect",{width:14,height:20,x:5,y:2,rx:2}],["path",{d:"M12 18h.01"}]],
    rocket:       [["path",{d:"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"}],["path",{d:"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"}],["path",{d:"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"}]],
    "shield-check":[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{d:"m9 12 2 2 4-4"}]],
    package:      [["path",{d:"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"}],["path",{d:"M12 22V12"}],["path",{d:"M3.29 7 12 12 20.71 7"}]],
    chrome:       [["circle",{cx:12,cy:12,r:10}],["circle",{cx:12,cy:12,r:4}],["line",{x1:21.17,x2:12,y1:8,y2:8}],["line",{x1:3.95,x2:8.54,y1:6.06,y2:14}],["line",{x1:10.88,x2:15.46,y1:21.94,y2:14}]],
    "file-code":  [["path",{d:"M10 12.5 8 15l2 2.5"}],["path",{d:"m14 12.5 2 2.5-2 2.5"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4"}],["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"}]],
    link:         [["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]],
    layers:       [["path",{d:"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"}],["path",{d:"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"}],["path",{d:"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"}]],
    code:         [["polyline",{points:"16 18 22 12 16 6"}],["polyline",{points:"8 6 2 12 8 18"}]],
};

// Whole words only. The old rules were bare substrings, which is how "shadow"
// became a gear (sh), "memory" a person (me) and "email" a robot (ai). Every
// matching rule is a candidate, in this order, so a label like "overlay.js" has
// a second choice (layers) when its first (file-code) is already taken.
const ICON_RULES: [string, RegExp][] = [
    ["user",         /\b(you|me|i|user|users|client|person|people|human|customer|visitor|owner|admin|dev|developer|engineer|operator)\b/],
    ["bot",          /\b(agent|agt|bot|ai|robot|llm|gpt|claude|assistant|model|copilot)\b/],
    ["file-code",    /\.(m?[jt]sx?|c?js|py|rb|go|rs|php|java|kt|swift|s?css|html?|json|ya?ml|toml|sh|zsh|sql|md|txt|env)\b|\b(script|module)\b/],
    ["code",         /\.(m?[jt]sx?|c?js|py|rb|go|rs|php|java|kt|swift|s?css|html?|json|ya?ml|toml|sh|zsh|sql|md|txt|env)\b|\b(script|module|function|fn)\b/],
    ["chrome",       /\b(chrome|chromium|toolbar|extension|popup)\b/],
    ["link",         /\b(page|pages|tab|url|link|site|website|webpage|document|dom)\b/],
    ["layers",       /\b(shadow|overlay|layer|layers|component|widget|iframe|panel)\b/],
    ["server",       /\b(api|server|backend|svc|service|micro|microservice|http|route|handler|endpoint|worker|gateway|proxy)\b/],
    ["database",     /\b(db|database|sql|postgres|mysql|mongo|dynamo|data|store|table|supabase)\b/],
    ["zap",          /\b(cache|redis|memcache|cdn|edge)\b/],
    ["plug",         /\b(mcp|plugin|webhook|hook|connector|integration|adapter)\b/],
    ["git-branch",   /\b(git|github|gitlab|repo|repository|version|commit|branch|pr)\b/],
    ["globe",        /\b(web|browser|frontend|ui|react|next|nextjs|html|www|internet)\b/],
    ["brain",        /\b(mem|memory|context|knowledge|rag|embedding|embeddings|vector)\b/],
    ["settings",     /\b(sh|shell|bash|zsh|terminal|cmd|cli|exec|process|config|runtime|root|engine|core)\b/],
    ["folder",       /\b(file|files|fs|storage|disk|s3|blob|drive|folder|bucket)\b/],
    ["cloud",        /\b(cloud|aws|azure|gcp|infra|deploy|lambda|serverless)\b/],
    ["mail",         /\b(queue|msg|kafka|rabbit|rabbitmq|sqs|pubsub|bus|email|mail|smtp|send|inbox)\b/],
    ["lock",         /\b(auth|security|oauth|jwt|sso|iam|secret|login|session|token)\b/],
    ["key",          /key\b|\b(credential|credentials)\b/],
    ["search",       /\b(search|elastic|elasticsearch|algolia|query|index)\b/],
    ["chart-bar",    /\b(log|logs|logger|monitor|metric|metrics|grafana|datadog|obs|observability|analytics|report)\b/],
    ["credit-card",  /\b(pay|payment|payments|stripe|billing|invoice|wallet|checkout)\b/],
    ["smartphone",   /\b(mobile|app|ios|android|phone|device)\b/],
    ["rocket",       /\b(ci|cd|pipeline|build|vercel|netlify|action|actions|release)\b/],
    ["shield-check", /\b(test|tests|spec|qa|lint|check|checks|e2e|cypress|playwright|validator|validation)\b/],
    ["bell",         /\b(notification|notifications|alert|alerts|notify|push|toast)\b/],
];

// When a participant has no candidate left, take the first unused icon from
// here. Neutral shapes first; a person or a robot is never a fallback, because
// a person icon on "Foo" is exactly the kind of guess this exists to stop.
const ICON_POOL = ["package", "layers", "settings", "code", "folder", "server", "cloud", "globe", "zap", "plug", "link", "search", "key", "lock", "mail", "bell", "rocket", "chart-bar", "brain", "file-code", "database", "git-branch", "smartphone", "credit-card", "shield-check", "chrome"];

function iconCandidates(label: string): string[] {
    const l = label.toLowerCase();
    return ICON_RULES.filter(([, re]) => re.test(l)).map(([k]) => k);
}

function guessIconKey(s: string): string {
    return iconCandidates(s)[0] ?? "package";
}

// One icon per participant, no repeats. Explicit picks (o.icons) are honored
// and reserved first, so an auto pick never collides with something the owner
// chose. Auto picks go by rank, not by participant order: every first choice
// is placed before any second choice, so "Closed shadow root" keeps layers
// even when an earlier "overlay.js" would have taken it as a runner-up. What
// is still unplaced after the candidates takes the first unused pool icon.
function assignIconKeys(ps: { id: string; label: string }[], explicit: Record<string, string> = {}): Record<string, string> {
    const used = new Set<string>();
    const out: Record<string, string> = {};
    for (const p of ps) {
        const k = explicit[p.id];
        if (k && ICON_NODES[k]) { out[p.id] = k; used.add(k); }
    }
    const cands = ps.map(p => out[p.id] ? [] : iconCandidates(p.label));
    const maxRank = Math.max(0, ...cands.map(c => c.length));
    for (let r = 0; r < maxRank; r++) {
        ps.forEach((p, i) => {
            const k = cands[i][r];
            if (!out[p.id] && k && !used.has(k)) { out[p.id] = k; used.add(k); }
        });
    }
    for (const p of ps) {
        if (out[p.id]) continue;
        const pick = ICON_POOL.find(k => !used.has(k)) ?? "package";
        out[p.id] = pick;
        used.add(pick);
    }
    return out;
}

function renderIcon(key: string, icx: number, icy: number, size: number, color = "white"): string {
    const nodes = ICON_NODES[key] ?? ICON_NODES.package;
    const s = size / 24;
    const tx = (icx - size / 2).toFixed(1);
    const ty = (icy - size / 2).toFixed(1);
    const sw = (1.8 / s).toFixed(2);
    const elems = nodes.map(([tag, props]) => {
        const attrs = Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(" ");
        return `<${tag} ${attrs}/>`;
    }).join("");
    return `<g transform="translate(${tx},${ty}) scale(${s.toFixed(4)})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${elems}</g>`;
}

const DIAGRAM_TYPES: Record<string, string> = {
    sequencediagram: "sequence",
    graph:           "flowchart",
    flowchart:       "flowchart",
    classdiagram:    "class",
    erdiagram:       "er",
    statediagram:    "state",
    "statediagram-v2": "state",
    gantt:           "gantt",
    pie:             "pie",
    journey:         "journey",
    gitgraph:        "git",
    "gitgraph:":     "git",
    mindmap:         "mindmap",
    timeline:        "timeline",
    quadrantchart:   "quadrant",
    xychart:         "xychart",
    "xychart-beta":  "xychart",
    requirementdiagram: "requirement",
    "c4context":     "c4",
    "c4container":   "c4",
    "c4component":   "c4",
    "c4dynamic":     "c4",
    "c4deployment":  "c4",
    block:           "block",
    "block-beta":    "block",
    sankey:          "sankey",
    "sankey-beta":   "sankey",
    packet:          "packet",
    "packet-beta":   "packet",
    kanban:          "kanban",
    architecture:    "architecture",
    "architecture-beta": "architecture",
    radar:           "radar",
    "radar-beta":    "radar",
    treemap:         "treemap",
};

function stripFrontmatter(code: string): string {
    let s = code.trim();
    const fenceMatch = s.match(/^`{3}[^\n\r]*[\r\n]+([\s\S]*?)`{3}\s*$/);
    if (fenceMatch) s = fenceMatch[1].trimStart();
    const lines = s.split("\n");
    if (lines[0]?.trim() !== "---") return s;
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
    if (end === -1) return s;
    return lines.slice(end + 1).join("\n").trimStart();
}

function detectSequenceType(code: string): string {
    const stripped = stripFrontmatter(code);
    for (const raw of stripped.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("%%") || /^title[\s:]/i.test(line) || /^accTitle\s*:/i.test(line) || /^accDescr\s*:/i.test(line)) continue;
        const key = line.toLowerCase().replace(/\s+.*$/, "");
        return DIAGRAM_TYPES[key] ?? "diagram";
    }
    return "diagram";
}

const DEFAULT_DIAGRAM_TITLE = "Sequence Diagram";

function parse(code: string): Diagram {
    const participants: Participant[] = [];
    const map = new Map<string, Participant>();
    const messages: SeqMsg[] = [];
    const notes: SeqNote[] = [];
    let step = 0, seqPos = 0, ci = 0;
    let title: string | undefined;
    function addP(id: string, label?: string) {
        if (!map.has(id)) {
            const p: Participant = { id, color: PAL[ci++ % PAL.length], label: (label ?? id).replace(/\[(.+?)\]/g, "($1)").replace(/<br\s*\/?>/gi, " ").trim() };
            participants.push(p); map.set(id, p);
        }
    }
    for (const raw of code.split("\n")) {
        const l = raw.trim();
        if (!l || /^(%%|sequenceDiagram|autonumber|---|```)/.test(l)) continue;
        const tm = l.match(/^title:?\s+(.+)$/i);
        if (tm) { title = tm[1].trim(); continue; }
        const pm = l.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/i);
        if (pm) { addP(pm[1], pm[2]); continue; }
        const nm = l.match(/^note\s+(over|left\s+of|right\s+of)\s+([\w,\s]+?):\s*(.*)$/i);
        if (nm) {
            const posRaw = nm[1].toLowerCase();
            const pos: "over" | "left" | "right" = posRaw.startsWith("l") ? "left" : posRaw.startsWith("r") ? "right" : "over";
            const pIds = nm[2].split(",").map(s => s.trim()).filter(Boolean);
            pIds.forEach(id => addP(id));
            notes.push({ participants: pIds, text: nm[3].trim(), position: pos, seqPos: seqPos || 1 });
            continue;
        }
        const mm = l.match(/^(\w+)\s*(-->>|->>|-->|->)\s*(\w+):\s*(.*)$/);
        if (mm) {
            const [, fId, arr, tId, rawText] = mm;
            addP(fId); addP(tId);
            const cleaned = rawText.replace(/<br\s*\/?>/gi, " ").trim();
            const numPfx = cleaned.match(/^(\d+)\.\s+([\s\S]*)$/);
            ++seqPos;
            messages.push({
                from: fId, to: tId,
                text: numPfx ? numPfx[2].trim() : cleaned,
                arrow: arr.startsWith("--") ? "dashed" : "solid",
                step: ++step, seqPos,
                displayStep: numPfx ? parseInt(numPfx[1]) : undefined,
            });
        }
    }
    return { participants, messages, notes, title, totalSteps: seqPos };
}

function esc(s: string) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

const LIFELINE_DASH: Record<string, { da: string; cap?: string; sw?: number }> = {
    solid: { da: "none" }, dot: { da: "2 5" }, small: { da: "7 5" }, long: { da: "20 8" },
};

const THEMES: Record<string, { bg: string; titleFill: string; boxStroke: string; boxStrokeW: string; labelFill: string; plainTextFill: string }> = {
    light:   { bg: "#ffffff", titleFill: "#1e293b",  boxStroke: "#000000", boxStrokeW: "2",   labelFill: "#000000", plainTextFill: "#1e293b" },
    dark:    { bg: "#16161e", titleFill: "#c0caf5",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "white",   plainTextFill: "#c0caf5" },
    monokai: { bg: "#2C2B2F", titleFill: "#f8f8f2",  boxStroke: "none",    boxStrokeW: "0",   labelFill: "#2C2B2F", plainTextFill: "#f8f8f2" },
};

// This is the full buildSvg — identical to page.tsx but importable server-side.
// `interactive: false` omits the inline hover <script> so the SVG is safe for
// hosts that strip script-bearing markup (Confluence, GitHub, docs embeds).
// ── Auto layout - the compact layout, computed from the diagram itself ──────
// Lives here, not in the editor, so every render path agrees: the editor, the
// public /svg/<id> route, the index previews, the OG image and a README embed
// all get the same geometry for the same diagram.
function computeAutoLayout(d: Diagram, o: Pick<Opts, "iconMode">): Layout {
    const rows = d.messages.length;
    const ICON_W = o.iconMode === "icons" ? 26 : 0;

    // Font size: shrink slightly for large sequences
    const FS = rows > 30 ? 11 : rows > 15 ? 12 : 13;

    // Box width: fit the longest participant label
    const HPAD = 24;
    const boxWidth = Math.max(90, ...d.participants.map(p =>
        Math.ceil(p.label.length * (FS * 0.65) + ICON_W + HPAD)
    ));

    // Row pitch: the tallest thing on a row is the 24px step circle (cr = 12
    // below); the pill is FS + 8. 8px of air between rows is the tightest that
    // still reads as separate rows, at any row count.
    const stepHeight = Math.max(24, FS + 8) + 8;

    // Spacing: a display value only. Under auto, buildSvg ignores l.spacing and
    // widens each column pair to exactly the longest pill that crosses it.
    const maxMsgLen = d.messages.reduce((m, msg) => Math.max(m, msg.text.length), 0);
    const pillEstimate = maxMsgLen * (FS * 0.65) + 48; // 0.65 char width + circle room
    const spacing = Math.round(Math.max(boxWidth + 80, boxWidth + pillEstimate));

    // Margin: outer padding on all 4 sides. The one real constraint is a
    // self-message on the LAST participant: its pill hangs 16px right of the
    // lifeline and buildSvg does not widen the canvas for it, so the margin must.
    const last = d.participants[d.participants.length - 1]?.id;
    const selfPillW = d.messages
        .filter(m => m.from === last && m.to === last)
        .reduce((w, m) => Math.max(w, m.text.length * (FS * 0.62) + 12), 0);
    const margin = Math.max(56, Math.ceil(16 + selfPillW - boxWidth / 2));

    // vPad 0: stepHeight already contains the row, so 0 is tight without overlap
    return { textSize: FS, boxWidth, spacing, stepHeight, vPad: 0, margin };
}

function buildSvg(d: Diagram, o: Opts, lIn: Layout, createdAt?: string | Date, { interactive = true }: { interactive?: boolean } = {}): string {
    const { participants: ps_raw, messages: ms } = d;
    if (!ps_raw.length) return "";
    // Auto layout is resolved here rather than by each caller, so a server
    // render is identical to what the editor shows.
    const l = o.autoLayout ? computeAutoLayout(d, o) : lIn;
    const ps = ps_raw.map(p => o.labelOverrides?.[p.id] ? { ...p, label: o.labelOverrides[p.id] } : p);
    const N = ps.length;
    const BR = 6, LP = l.margin ?? 50, MG = l.stepHeight;
    const AH = 8, FS = l.textSize;
    const BOX_FS = 13;
    const BH = Math.max(36, Math.round(BOX_FS * 2.6));
    const diagramTitle = d.title ?? DEFAULT_DIAGRAM_TITLE;
    const TOP_PAD = l.margin, BOT_PAD = l.margin, TITLE_H = 68, TP = 50;
    const HPAD = 24, ICON_W = o.iconMode === "icons" ? 26 : 0;
    const pBW = ps.map(p => Math.max(l.boxWidth, Math.ceil(p.label.length * (BOX_FS * 0.65) + ICON_W + HPAD)));
    const BW = Math.max(...pBW);
    const idx = new Map(ps.map((p, i) => [p.id, i]));
    // A pill is text + 12, and each end of the arrow reserves 24 for the step
    // circle (circleRoom below), so a column pair needs text + 60 to show the
    // pill whole. At 56 the longest message in every pair lost its last 2
    // characters to an ellipsis, under auto layout, every time.
    const CHAR_W = FS * 0.62, PILL_PAD = 60;
    const baseCol = o.autoLayout ? Math.max(BW + 40, 120) : l.spacing;
    const colGap = new Array(Math.max(1, N - 1)).fill(baseCol) as number[];
    if (o.autoLayout) {
        ms.forEach(msg => {
            const fi = idx.get(msg.from) ?? -1, ti = idx.get(msg.to) ?? -1;
            if (fi < 0 || ti < 0 || fi === ti) return;
            const lo = Math.min(fi, ti), hi = Math.max(fi, ti), span = hi - lo;
            const perCol = (msg.text.length * CHAR_W + PILL_PAD) / span;
            for (let c = lo; c < hi; c++) if (perCol > colGap[c]) colGap[c] = perCol;
        });
    }
    const colX: number[] = [LP + BW / 2];
    for (let i = 1; i < N; i++) colX.push(colX[i - 1] + colGap[i - 1]);
    const cx = (i: number) => colX[i] ?? LP + BW / 2;
    const W = N > 1 ? colX[N - 1] + BW / 2 + LP : 2 * LP + BW;
    const VP = l.vPad ?? 44;
    const totalSteps = d.totalSteps || ms.length;
    const NOTE_HPAD = 14, NOTE_VPAD = 10, NOTE_ITEM_GAP = 8, NOTE_SEC_PAD = 16, CORNER = 8;
    const noteLineH = FS + 6;
    const notesByCol = new Map<number, SeqNote[]>();
    if (o.showNotes !== false) {
        d.notes.forEach(note => {
            const pis = note.participants.map(id => idx.get(id)).filter((i): i is number => i !== undefined);
            if (!pis.length) return;
            const col = Math.min(...pis);
            if (!notesByCol.has(col)) notesByCol.set(col, []);
            notesByCol.get(col)!.push(note);
        });
    }
    const noteMaxW = (colI: number) => {
        const leftGap = colI > 0 ? colGap[colI - 1] : (colX[colI] - LP) * 2;
        const rightGap = colI < N - 1 ? colGap[colI] : (W - colX[colI] - LP) * 2;
        return Math.max(pBW[colI] ?? BW, Math.floor((leftGap + rightGap) * 0.45));
    };
    const noteFitW = (colI: number, text: string) => {
        const rawLines = text.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
        const longest = rawLines.reduce((m, l) => Math.max(m, l.length), 0);
        const desired = Math.ceil(longest * (FS * 0.58)) + NOTE_HPAD * 2;
        return Math.max(pBW[colI] ?? BW, Math.min(desired, noteMaxW(colI)));
    };
    let notesSectionH = 0;
    if (notesByCol.size > 0) {
        let maxColH = 0;
        notesByCol.forEach((colNotes, colI) => {
            let colH = 0;
            colNotes.forEach(note => {
                const nw = noteFitW(colI, note.text);
                const maxChars = Math.max(8, Math.floor((nw - NOTE_HPAD * 2) / (FS * 0.58)));
                const rawLines = note.text.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean);
                let wCount = 0;
                rawLines.forEach(raw => {
                    const words = raw.split(" ");
                    let cur = "";
                    words.forEach(w => {
                        if (!cur) { cur = w; return; }
                        if ((cur + " " + w).length <= maxChars) { cur += " " + w; }
                        else { wCount++; cur = w; }
                    });
                    if (cur) wCount++;
                });
                colH += wCount * noteLineH + NOTE_VPAD * 2 + NOTE_ITEM_GAP;
            });
            maxColH = Math.max(maxColH, colH);
        });
        notesSectionH = maxColH + NOTE_SEC_PAD * 2;
    }
    const stepGap = MG + VP;
    // Default breathing room between the header/footer boxes and the first/last
    // step, applied only at the top and bottom edges (not between every step).
    const EDGE_PAD = 24;
    const H = TOP_PAD + TITLE_H + TP + BH + EDGE_PAD + VP + Math.max(0, totalSteps - 1) * stepGap + VP + EDGE_PAD + BH + notesSectionH + BOT_PAD;
    const lt = TOP_PAD + TITLE_H + TP + BH, lb = H - BOT_PAD - notesSectionH - BH;
    const msgY = (s: number) => TOP_PAD + TITLE_H + TP + BH + EDGE_PAD + VP + (s - 1) * stepGap;
    const f = `'${o.font}', sans-serif`;
    const ld = LIFELINE_DASH[o.lifelineDash] ?? LIFELINE_DASH.solid;
    const lifelineSW = ld.sw ?? 1.5;
    const lifelineCapAttr = ld.cap ? ` stroke-linecap="${ld.cap}"` : "";
    const th = THEMES[o.theme] ?? THEMES.light;
    const pal = o.theme === "monokai" ? PAL_MONOKAI : PAL;
    const pcol = (i: number) => o.colorOverrides?.[ps[i].id] ?? pal[i % pal.length];
    const DASHED_STYLE = ` stroke-dasharray="3 4" stroke-width="1.5"`;
    const parts: string[] = [];
    const defs: string[] = [];
    parts.push(`<rect width="${W}" height="${H}" fill="${th.bg}"/>`);
    const titleY = TOP_PAD + TITLE_H / 2 + 1;
    const now = createdAt ? new Date(createdAt) : new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const isDark = o.theme !== "light";
    const titleColor = isDark ? "#ffffff" : th.titleFill;
    const subBH = isDark ? "#e2e8f0" : "#a0aec0";
    const subPipe = isDark ? "#94a3b8" : "#cbd5e0";
    const subDate = isDark ? "#94a3b8" : "#718096";
    const titleAvailW = W - 2 * LP;
    const titleFS = Math.max(14, Math.min(30, Math.floor(titleAvailW / (diagramTitle.length * 0.58))));
    parts.push(`<text id="diagram-title" x="${LP}" y="${titleY - 10}" dominant-baseline="middle" font-family="${f}" font-size="${titleFS}" font-weight="800" fill="${titleColor}" style="cursor:pointer">${esc(diagramTitle)}</text>`);
    parts.push(`<text x="${LP}" y="${titleY + 20}" dominant-baseline="middle" font-family="${f}" font-size="11" fill="${subDate}"><tspan font-weight="800" fill="${subBH}">BH</tspan><tspan font-weight="300" fill="${subPipe}"> | </tspan><tspan font-weight="400">${dateStr} · ${timeStr}</tspan></text>`);
    const iconKeys = assignIconKeys(ps, o.icons);
    ps.forEach((p, i) => {
        const col = pcol(i);
        const c = o.coloredLines ? col + "60" : "#d1d5db";
        parts.push(`<line x1="${cx(i)}" y1="${lt}" x2="${cx(i)}" y2="${lb}" stroke="${c}" stroke-width="${lifelineSW}" stroke-dasharray="${ld.da}"${lifelineCapAttr} data-pid="${esc(p.id)}"/>`);
    });
    const renderBox = (p: Participant, i: number, y: number) => {
        p = { ...p, label: p.label.replace(/<br\s*\/?>/gi, " ").trim() };
        const bw = pBW[i]; const x = cx(i) - bw / 2; const col = pcol(i);
        parts.push(`<g data-pid="${esc(p.id)}" style="cursor:pointer">`);
        parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH}" rx="${BR}" fill="${col}" stroke="${th.boxStroke}" stroke-width="${th.boxStrokeW}"/>`);
        if (o.boxOverlay !== "none") {
            const clipId = `bcp${i}_${Math.round(y)}`;
            defs.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${bw}" height="${BH}" rx="${BR}"/></clipPath>`);
            const cg = `clip-path="url(#${clipId})"`;
            if (o.boxOverlay === "gloss") {
                parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH * 0.55}" ${cg} fill="white" fill-opacity="0.18"/>`);
                parts.push(`<rect x="${x}" y="${y}" width="${bw}" height="${BH * 0.22}" ${cg} fill="white" fill-opacity="0.12"/>`);
            }
        }
        const emojiM = p.label.match(/^(\p{Extended_Pictographic}[\uFE0F\u20E3]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\u20E3]?)*)\s*/u);
        const labelEmoji = emojiM ? emojiM[1] : null;
        const labelText = labelEmoji ? p.label.slice(emojiM![0].length).trim() : p.label;
        if (o.iconMode === "icons") {
            const IW = BH; const pColor = pcol(i); const ISIZE = Math.min(BH - 8, 18);
            const iconKey = iconKeys[p.id];
            const r = Math.max(0, BR - 1);
            const wx = x + 1, wy = y + 1, ww = IW - 1, wh = BH - 2;
            const wp = `M${wx+r},${wy} H${wx+ww} V${wy+wh} H${wx+r} Q${wx},${wy+wh} ${wx},${wy+wh-r} V${wy+r} Q${wx},${wy} ${wx+r},${wy} Z`;
            parts.push(`<path d="${wp}" fill="white" fill-opacity="0.92"/>`);
            parts.push(`<line x1="${x+IW-1}" y1="${y+4}" x2="${x+IW-1}" y2="${y+BH-4}" stroke="white" stroke-opacity="0.35" stroke-width="1"/>`);
            parts.push(renderIcon(iconKey, x + IW / 2, y + BH / 2, ISIZE, pColor));
            parts.push(`<text x="${x + IW + (bw - IW)/2}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${BOX_FS}" font-weight="700" fill="${th.labelFill}">${esc(labelText)}</text>`);
        } else if (o.iconMode === "emoji" && labelEmoji) {
            const IW = BH; const r = Math.max(0, BR - 1);
            const wx = x + 1, wy = y + 1, ww = IW - 1, wh = BH - 2;
            const wp = `M${wx+r},${wy} H${wx+ww} V${wy+wh} H${wx+r} Q${wx},${wy+wh} ${wx},${wy+wh-r} V${wy+r} Q${wx},${wy} ${wx+r},${wy} Z`;
            parts.push(`<path d="${wp}" fill="white" fill-opacity="0.92"/>`);
            parts.push(`<text x="${x + IW/2}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-size="${BH*0.52}">${labelEmoji}</text>`);
            parts.push(`<text x="${x + IW + (bw - IW)/2}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${BOX_FS}" font-weight="700" fill="${th.labelFill}">${esc(labelText)}</text>`);
        } else {
            parts.push(`<text x="${cx(i)}" y="${y+BH/2+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${BOX_FS}" font-weight="700" fill="${th.labelFill}">${esc(p.label)}</text>`);
        }
        parts.push(`</g>`);
    };
    ps.forEach((p, i) => renderBox(p, i, TOP_PAD + TITLE_H + TP));
    ms.forEach(msg => {
        const fi = idx.get(msg.from) ?? 0, ti = idx.get(msg.to) ?? 0;
        const y = msgY(msg.seqPos); const fx = cx(fi), tx = cx(ti);
        const fpColor = pcol(fi);
        const stepNum = msg.displayStep ?? msg.step;
        // Uniform circle radius for single- and double-digit step numbers.
        const cr = 12;
        parts.push(`<g data-from="${esc(msg.from)}" data-to="${esc(msg.to)}">`);
        const lc = o.coloredLines ? fpColor : "#374151";
        const pillTextFill = o.theme === "dark" ? "#ffffff" : "#000000";
        if (fi === ti) {
            const pillOffset = o.coloredNumbers ? fx + cr + 4 : fx + 6;
            if (o.coloredText) {
                const pillH = FS + 8, pillW = Math.max(40, msg.text.length * (FS * 0.62) + 12);
                const pillX = pillOffset, pillY = y - pillH / 2;
                parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.08" stroke="${fpColor}" stroke-width="1"/>`);
                parts.push(`<text x="${pillX + pillW / 2}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(msg.text)}</text>`);
            } else {
                parts.push(`<text x="${pillOffset}" y="${y+1}" dominant-baseline="middle" font-family="${f}" font-size="${FS}" fill="${fpColor}">${esc(msg.text)}</text>`);
            }
        } else {
            const dir = tx > fx ? 1 : -1;
            const isDashed = msg.arrow === "dashed";
            const lineX1 = o.coloredNumbers ? fx + dir * (cr + 4) : fx;
            if (isDashed) {
                parts.push(`<line x1="${lineX1}" y1="${y}" x2="${tx-dir*AH}" y2="${y}" stroke="${lc}"${DASHED_STYLE}/>`);
                if (dir === 1) parts.push(`<polyline points="${tx-AH},${y-5} ${tx},${y} ${tx-AH},${y+5}" fill="none" stroke="${lc}" stroke-width="1.5"/>`);
                else parts.push(`<polyline points="${tx+AH},${y-5} ${tx},${y} ${tx+AH},${y+5}" fill="none" stroke="${lc}" stroke-width="1.5"/>`);
            } else {
                parts.push(`<line x1="${lineX1}" y1="${y}" x2="${tx-dir*AH}" y2="${y}" stroke="${lc}" stroke-width="1.5"/>`);
                if (dir === 1) parts.push(`<polygon points="${tx},${y} ${tx-AH},${y-5} ${tx-AH},${y+5}" fill="${lc}"/>`);
                else parts.push(`<polygon points="${tx},${y} ${tx+AH},${y-5} ${tx+AH},${y+5}" fill="${lc}"/>`);
            }
            const mid = (fx + tx) / 2;
            if (o.coloredText) {
                const pillH = FS + 8, pillY = y - pillH / 2;
                const circleRoom = o.coloredNumbers ? 24 : 8;
                const leftBound = Math.min(fx, tx) + circleRoom;
                const rightBound = Math.max(fx, tx) - circleRoom;
                const availW = Math.max(40, rightBound - leftBound);
                let pillText = msg.text;
                let pillW = Math.max(40, pillText.length * (FS * 0.62) + 12);
                // Under auto layout a column pair is sized to exactly this pill, so
                // pillW and availW are equal up to float error; a bare > would
                // truncate the very message the gap was widened for by 1 char.
                if (pillW > availW + 0.5) { pillW = availW; const mc = Math.max(1, Math.floor((availW - 20) / (FS * 0.62))); if (mc < pillText.length) pillText = pillText.slice(0, mc) + "…"; }
                const pillX = Math.max(leftBound, Math.min(mid - pillW / 2, rightBound - pillW));
                const pillCx = pillX + pillW / 2;
                parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${th.bg}"/>`);
                parts.push(`<rect x="${pillX}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${fpColor}" fill-opacity="0.08" stroke="${fpColor}" stroke-width="1"/>`);
                parts.push(`<text x="${pillCx}" y="${pillY + pillH / 2 + 1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="${FS}" font-weight="600" fill="${pillTextFill}">${esc(pillText)}</text>`);
            } else {
                parts.push(`<text x="${mid}" y="${y-8}" text-anchor="middle" font-family="${f}" font-size="${FS}" fill="${fpColor}">${esc(msg.text)}</text>`);
            }
        }
        if (o.coloredNumbers) {
            parts.push(`<circle cx="${fx}" cy="${y}" r="${cr}" fill="${fpColor}" stroke="${fpColor}" stroke-width="2"/>`);
            parts.push(`<text x="${fx}" y="${y+1}" text-anchor="middle" dominant-baseline="middle" font-family="${f}" font-size="11" font-weight="700" fill="${th.labelFill}">${stepNum}</text>`);
        }
        parts.push(`</g>`);
    });
    ps.forEach((p, i) => renderBox(p, i, lb));
    if (defs.length) parts.splice(1, 0, `<defs>${defs.join("")}</defs>`);
    // Hover interactivity: hover a participant -> dim everything not connected.
    // Click pins the selection (works on touch). Click outside or click the
    // same participant again to clear. Only runs when SVG is opened as a
    // standalone document (e.g. /svg/<id>); harmless when embedded as <img>.
    const interactivity = `<style>[data-pid]{cursor:pointer}[data-pid],g[data-from]{transition:opacity .14s}</style><script><![CDATA[(function(){var es=document.querySelectorAll('[data-pid],g[data-from]');var pinned=null;function d(id){es.forEach(function(e){var k=e.getAttribute('data-pid')===id||e.getAttribute('data-from')===id||e.getAttribute('data-to')===id;e.style.opacity=k?'1':'0.18'})}function c(){es.forEach(function(e){e.style.opacity=''})}document.querySelectorAll('[data-pid]').forEach(function(b){var id=b.getAttribute('data-pid');b.addEventListener('mouseenter',function(){if(!pinned)d(id)});b.addEventListener('mouseleave',function(){if(!pinned)c()});b.addEventListener('click',function(ev){ev.stopPropagation();if(pinned===id){pinned=null;c()}else{pinned=id;d(id)}})});document.addEventListener('click',function(){if(pinned){pinned=null;c()}})})();]]></script>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(diagramTitle)}"><title>${esc(diagramTitle)}</title>${parts.join("")}${interactive ? interactivity : ""}</svg>`;
}
