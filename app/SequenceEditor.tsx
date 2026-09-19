"use client";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Code2, SlidersHorizontal, X, ArrowLeft } from "lucide-react";
import { CuteToast, showToast } from "./CuteToast";
import dynamic from "next/dynamic";
const Editor = dynamic(() => import("react-simple-code-editor"), { ssr: false });
import Prism from "prismjs";
import LZString from "lz-string";
const MermaidRenderer = dynamic(() => import("./MermaidRenderer"), { ssr: false });
import {
  parse, buildSvg, esc, detectSequenceType, stripFrontmatter,
  guessIconKey, renderIcon,
  PAL, PAL_MONOKAI, THEMES, ICON_NODES, LIFELINE_DASH, DIAGRAM_TYPES,
  DEFAULT_OPTS, DEFAULT_LAYOUT, DEFAULT_DIAGRAM_TITLE,
} from "@/lib/svg-renderer";
import type { Participant, Arrow, SeqMsg, SeqNote, Diagram, Opts, Layout } from "@/lib/svg-renderer";
import { SettingsContent, UI_THEMES, type UiTheme } from "./EditorSettings";
import { extractTitle, zoomStep, pushUndo } from "@/lib/editor-logic";

// ── Sequence diagram Prism grammar ────────────────────────────────────────────
Prism.languages.sequence = {
    comment:  { pattern: /%%.*/, greedy: true },
    title:    { pattern: /^title:.+/m, inside: { keyword: /^title:/, string: /.+/ } },
    keyword:  /\b(sequenceDiagram|participant|actor|as|autonumber|loop|alt|else|end|opt|par|and|critical|break|rect|Note|over|left of|right of|activate|deactivate|graph|flowchart|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|gantt|pie|mindmap|timeline|gitGraph|subgraph|quadrantChart|xychart-beta|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|block-beta|sankey-beta|packet-beta|kanban|architecture-beta|radar-beta|treemap|journey|section|direction|root|dateFormat|axisFormat|excludes|includes|todayMarker|title|accTitle|accDescr|click|style|classDef|linkStyle|interpolate|commit|branch|checkout|merge|cherry-pick|column|service|group|in)\b/,
    arrow:    /-->>|->>|-->|->|==>/,
    label:    { pattern: /:.+/, inside: { punctuation: /:/, string: /.+/ } },
    number:   /\b\d+\b/,
    operator: /[|{}[\]()]/,
};

function highlight(code: string) {
    return Prism.highlight(code, Prism.languages.sequence, "sequence");
}

// Types, constants, parse(), buildSvg(), icon system are imported from
// @/lib/svg-renderer above so the editor and server-side rendering share
// a single source of truth.

// ── Default Code ──────────────────────────────────────────────────────────────
const DEFAULT_CODE = `sequenceDiagram
    title My Diagram
    participant A
    participant B
    A->>B: Hello
    B-->>A: Hi!`;


// ── Router ────────────────────────────────────────────────────────────────────

// ── Editor ────────────────────────────────────────────────────────────────────
export default function SequenceEditor() {
    // The index is a server-rendered route, so leaving the editor is a plain
    // navigation back to it.
    const goBack = () => { window.location.href = "/"; };
    const [isOwner, setIsOwner] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [code, setCode] = useState("");
    const deferredCode = useDeferredValue(code);
    const [showCode, setShowCode] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [codeWidth, setCodeWidth] = useState(340);
    const [copied, setCopied] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedImage, setCopiedImage] = useState(false);
    const [copiedShare, setCopiedShare] = useState(false);
    const [diagramLoading, setDiagramLoading] = useState(false);
    const [hasFit, setHasFit] = useState(false);
    const [mermaidDims, setMermaidDims] = useState<{ w: number; h: number } | null>(null);
    const [fitActive, setFitActive] = useState(true);
    const fitActiveRef = useRef(true);
    const [opts, setOpts] = useState<Opts>(DEFAULT_OPTS);
    const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
    const [zoom, setZoom] = useState(1.0);
    const [viewMode, setViewMode] = useState(false);
    const [lanIp, setLanIp] = useState<string | null>(null);
    const [savedDiagramId, setSavedDiagramId] = useState<string | null>(null);
    const [diagramCreatedAt, setDiagramCreatedAt] = useState<string | null>(null);
    const [diagramDbTitle, setDiagramDbTitle] = useState<string | null>(null);
    const [isSharedDiagram, setIsSharedDiagram] = useState(false);
    const [titleEdit, setTitleEdit] = useState<{ value: string; rect: DOMRect } | null>(null);


    const sequenceType = useMemo(() => detectSequenceType(deferredCode), [deferredCode]);
    const isSequence = sequenceType === "sequence";
    const diagram = useMemo(() => deferredCode.trim() ? parse(deferredCode) : parse("sequenceDiagram"), [deferredCode]);

    const [selectedPid, setSelectedPid] = useState<string | null>(null);
    const [settingsTab, setSettingsTab] = useState<"general" | "components" | "share">("general");

    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const canvasRef = useRef<HTMLDivElement>(null);
    const svgWrapRef = useRef<HTMLDivElement>(null);
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartW = useRef(340);
    const isDragging = useRef(false);
    const dragStartMouse = useRef({ x: 0, y: 0 });
    const dragStartPan = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(1.0);
    const panRef = useRef({ x: 0, y: 0 });
    const spaceHeld = useRef(false);
    const viewWheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTitleToastRef = useRef<string | null>(null);
    const zoomHudRef = useRef<HTMLDivElement>(null);
    const zoomHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


    const flashZoomHud = (z: number) => {
        if (!zoomHudRef.current) return;
        zoomHudRef.current.textContent = `${Math.round(z * 100)}%`;
        zoomHudRef.current.style.opacity = "1";
        if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current);
        zoomHudTimer.current = setTimeout(() => {
            if (zoomHudRef.current) zoomHudRef.current.style.opacity = "0";
        }, 900);
    };

    const commitTitle = useCallback((val: string) => {
        setTitleEdit(null);
        const t = val.trim();
        if (!t) return;
        const newCode = /^title:?\s+.+$/im.test(code)
            ? code.replace(/^title:?\s+.+$/im, `title: ${t}`)
            : code.replace(/^(sequenceDiagram[^\n]*\n?)/im, `$1title: ${t}\n`);
        setCode(newCode);
        // Immediately patch the SVG text node so the title doesn't flicker back
        // to the old value while useDeferredValue catches up.
        if (svgWrapRef.current) {
            const titleEl = svgWrapRef.current.querySelector<SVGTextElement>("#diagram-title");
            if (titleEl) titleEl.textContent = t;
        }
        showToast(`Title saved`, { color: "#7c3aed" });
        if (savedDiagramId && isOwner) {
            fetch(`/api/sequences/${savedDiagramId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: t, code: newCode }),
            }).then(r => { if (!r.ok) r.json().then(e => showToast(`Save failed: ${e.error}`, { color: "#ef4444" })).catch(() => {}); });
        }
    }, [code, savedDiagramId, isOwner, svgWrapRef]);


    const clampPan = useCallback((p: { x: number; y: number }): { x: number; y: number } => {
        const el = canvasRef.current;
        if (!el) return p;
        const maxX = el.clientWidth * 0.8;
        const maxY = el.clientHeight * 0.8;
        return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
    }, []);

    const applyTransform = useCallback((p: { x: number; y: number }, z: number) => {
        if (!svgWrapRef.current) return;
        const cp = clampPan(p);
        panRef.current = cp;
        svgWrapRef.current.style.transform = `translate(calc(-50% + ${cp.x}px), calc(-50% + ${cp.y}px)) scale(${z})`;
    }, [clampPan]);


    // Sync refs → React state (call on gesture end only)
    const syncTransformState = useCallback(() => {
        setZoom(zoomRef.current);
        setPanX(panRef.current.x);
        setPanY(panRef.current.y);
    }, []);

    // Keep refs in sync for use in event handlers
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { panRef.current = { x: panX, y: panY }; }, [panX, panY]);
    fitActiveRef.current = fitActive;
    // Re-apply transform after every render - prevents React from overwriting
    // the direct DOM transform set by applyTransform during gestures.
    // useLayoutEffect runs synchronously before paint so there is zero flicker.
    useLayoutEffect(() => {
        if (!svgWrapRef.current) return;
        applyTransform(panRef.current, zoomRef.current);
        const titleEl = svgWrapRef.current.querySelector<SVGTextElement>("#diagram-title");
        if (titleEl) titleEl.style.visibility = titleEdit ? "hidden" : "";
    });

    // ── Resize drag (desktop) ───────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = e.clientX - resizeStartX.current;
            setCodeWidth(Math.max(220, Math.min(780, resizeStartW.current + delta)));
        };
        const onUp = () => { isResizing.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    // ── Wheel: pan (no modifier) + zoom-to-cursor (ctrl/cmd) ─────────────
    const wheelEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wheelRafId = useRef<number | null>(null);
    useEffect(() => {
        if (!mounted || viewMode) return;
        const el = canvasRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                // Pinch-to-zoom gesture
                const speed = e.deltaMode === 1 ? 0.036 : 0.0024;
                const oldZoom = zoomRef.current;
                const newZoom = parseFloat(Math.min(4, Math.max(0.1, oldZoom - e.deltaY * speed * oldZoom)).toFixed(3));
                zoomRef.current = newZoom;
                flashZoomHud(newZoom);
            } else {
                // Two-finger trackpad swipe → pan
                panRef.current = { x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY };
            }
            // Flush to DOM once per frame via rAF - batches all events between frames
            if (!wheelRafId.current) {
                wheelRafId.current = requestAnimationFrame(() => {
                    applyTransform(panRef.current, zoomRef.current);
                    wheelRafId.current = null;
                });
            }
            // Sync React state only after wheel stops
            if (wheelEndTimer.current) clearTimeout(wheelEndTimer.current);
            wheelEndTimer.current = setTimeout(() => {
                setZoom(zoomRef.current); setPanX(panRef.current.x); setPanY(panRef.current.y); setFitActive(false);
            }, 80);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [mounted, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Touch: pinch-zoom + pan ───────────────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const el = canvasRef.current;
        if (!el) return;

        let startTouchX = 0, startTouchY = 0;
        let startPanX = 0, startPanY = 0;
        let startPinchDist: number | null = null;
        let startZoomVal = 1;
        let isTouchPanning = false;

        const getDist = (t: TouchList) => {
            const dx = t[0].clientX - t[1].clientX;
            const dy = t[0].clientY - t[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                startPinchDist = getDist(e.touches);
                startZoomVal = zoomRef.current;
                isTouchPanning = false;
            } else if (e.touches.length === 1) {
                isTouchPanning = true;
                startPinchDist = null;
                startTouchX = e.touches[0].clientX;
                startTouchY = e.touches[0].clientY;
                startPanX = panRef.current.x;
                startPanY = panRef.current.y;
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && startPinchDist !== null) {
                e.preventDefault();
                const d = getDist(e.touches);
                const ratio = d / startPinchDist;
                const newZoom = Math.min(4, Math.max(0.1, startZoomVal * ratio));
                zoomRef.current = newZoom;
                applyTransform(panRef.current, zoomRef.current);
                flashZoomHud(newZoom);
            } else if (e.touches.length === 1 && isTouchPanning) {
                e.preventDefault();
                const dx = e.touches[0].clientX - startTouchX;
                const dy = e.touches[0].clientY - startTouchY;
                panRef.current = { x: startPanX + dx, y: startPanY + dy };
                applyTransform(panRef.current, zoomRef.current);
            }
        };

        const onTouchEnd = () => {
            startPinchDist = null;
            isTouchPanning = false;
            syncTransformState();
            setFitActive(false);
        };

        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd);
        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
        };
    }, [mounted, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Mouse drag pan ────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const dx = e.clientX - dragStartMouse.current.x;
            const dy = e.clientY - dragStartMouse.current.y;
            panRef.current = { x: dragStartPan.current.x + dx, y: dragStartPan.current.y + dy };
            applyTransform(panRef.current, zoomRef.current);
        };
        const onUp = () => {
            if (isDragging.current) { isDragging.current = false; syncTransformState(); }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    }, []);

    // ── Mount + localStorage + URL param ─────────────────────────────────
    useEffect(() => {
        setMounted(true);
        setIsMobile(window.innerWidth < 768);
        // Load opts/layout from localStorage
        const rawSearch = window.location.search;
        const params = new URLSearchParams(rawSearch);
        try { const o = localStorage.getItem("nsd-opts"); if (o) setOpts(prev => ({ ...prev, ...JSON.parse(o!) })); } catch {}
        try { const l = localStorage.getItem("nsd-layout"); if (l) setLayout(prev => ({ ...prev, ...JSON.parse(l!) })); } catch {}

        const dataParam = params.get("data");
        const urlId = params.get("id");
        const isNew = params.has("new");
        const isImported = params.get("imported") === "1";
        const isViewMode = params.get("view") === "1";

        // Auto-open code editor at 50% width for new sequences
        if (isNew && !isMobile) {
            setShowCode(true);
            setCodeWidth(Math.round(window.innerWidth * 0.5));
        }

        // ?data= - inline diagram code (LZ-compressed or plain URI-encoded)
        let decodedData = "";
        if (dataParam) {
            decodedData = LZString.decompressFromEncodedURIComponent(dataParam) || "";
            if (!decodedData) { try { decodedData = atob(dataParam); } catch { decodedData = ""; } }
            if (!decodedData) { try { decodedData = decodeURIComponent(dataParam); } catch { decodedData = ""; } }
            if (decodedData) {
                setCode(decodedData);
                const t = decodedData.match(/^(?:title|accTitle):?\s+(.+)$/im)?.[1]?.trim();
                if (t) setTimeout(() => showToast(t, { color: "#7c3aed" }), 400);
            }
        }

        if (urlId) {
            setSavedDiagramId(urlId);
            // is_public loaded from DB response below
        }

        // Fetch diagram - single path, no duplicate fetches
        if (urlId) {
            setDiagramLoading(true);
            fetch(`/api/sequences/${urlId}`).then(async r => {
                if (r.status === 403) return; // private diagram - auth check below handles it
                if (!r.ok) { setDiagramLoading(false); return; }
                const d = await r.json();
                if (d?.code) {
                    setCode(d.code);
                    setHasFit(false);
                    const t = d.code.match(/^(?:title|accTitle):?\s+(.+)$/im)?.[1]?.trim();
                    if (t) pendingTitleToastRef.current = t;
                }
                if (typeof d?.is_public === "boolean") setIsSharedDiagram(d.is_public);
                if (d?.created_at) setDiagramCreatedAt(d.created_at);
                if (d?.title) setDiagramDbTitle(d.title);
                if (d?.settings?.opts) setOpts(o => ({ ...o, ...d.settings.opts }));
                if (d?.settings?.layout) setLayout(l => ({ ...l, ...d.settings.layout }));
                setDiagramLoading(false);
                if (isImported) setTimeout(fireConfetti, 400);
            }).catch(() => setDiagramLoading(false));
        }

        // Owner check - authorized (owner session or local/LAN bypass) = full
        // editor; otherwise presenter mode. Reflects the server gate.
        fetch("/api/auth/me").then(r => r.json()).then(({ authorized }) => {
            if (authorized) {
                setIsOwner(true);
                if (pendingTitleToastRef.current) {
                    const t = pendingTitleToastRef.current;
                    pendingTitleToastRef.current = null;
                    setTimeout(() => showToast(t, { color: "#7c3aed" }), 400);
                }
            } else {
                // Not the owner - presenter mode
                setViewMode(true);
            }
        }).catch(() => setViewMode(true));
        // Fetch LAN IP for QR code when on localhost
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            fetch("/api/lan-ip").then(r => r.json()).then(d => { if (d.ip) setLanIp(d.ip); }).catch(() => {});
        }
    }, []);

    // ── Mobile detection on resize ────────────────────────────────────────
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // ── Persist ───────────────────────────────────────────────────────────
    // code is NOT persisted to localStorage - loaded from URL or paste only
    useEffect(() => {
        if (!mounted) return;
        const t = setTimeout(() => localStorage.setItem("nsd-opts", JSON.stringify(opts)), 300);
        return () => clearTimeout(t);
    }, [opts, mounted]);
    useEffect(() => {
        if (!mounted) return;
        const t = setTimeout(() => localStorage.setItem("nsd-layout", JSON.stringify(layout)), 300);
        return () => clearTimeout(t);
    }, [layout, mounted]);

    // ── Auto layout - compute from diagram content ────────────────────────
    const computedLayout = useMemo((): Layout => {
        if (!opts.autoLayout) return layout;

        const rows = diagram.messages.length;
        const ICON_W = opts.iconMode === "icons" ? 26 : 0;

        // Font size: shrink slightly for large sequences
        const FS = rows > 30 ? 11 : rows > 15 ? 12 : 13;

        // Box width: fit the longest participant label
        const HPAD = 24;
        const boxWidth = Math.max(90, ...diagram.participants.map(p =>
            Math.ceil(p.label.length * (FS * 0.65) + ICON_W + HPAD)
        ));

        // Step height: compress for dense sequences
        const stepHeight = rows > 40 ? 32 : rows > 20 ? 36 : rows > 10 ? 40 : 44;

        // Spacing: box width + enough room for the longest adjacent message pill + step circle
        const maxMsgLen = diagram.messages.reduce((m, msg) => Math.max(m, msg.text.length), 0);
        const pillEstimate = maxMsgLen * (FS * 0.65) + 48; // 0.65 char width + circle room
        const spacing = Math.round(Math.max(boxWidth + 80, boxWidth + pillEstimate));

        // vPad: zero by default - stepHeight already contains the row, so 0 is tight without overlap
        const vPad = 0;

        // margin: proportional to spacing
        const margin = Math.round(Math.max(80, spacing * 0.4));

        return { textSize: FS, boxWidth, spacing, stepHeight, vPad, margin };
    }, [opts.autoLayout, opts.iconMode, diagram, layout]);

    const svg = useMemo(() => {
        const d = diagram.title || !diagramDbTitle ? diagram : { ...diagram, title: diagramDbTitle };
        return buildSvg(d, opts, computedLayout, diagramCreatedAt ?? undefined);
    }, [diagram, opts, computedLayout, diagramCreatedAt, diagramDbTitle]);

    const activeSvg = svg;

    const svgDims = useMemo(() => {
        if (!isSequence) return mermaidDims;
        if (!activeSvg) return null;
        const w = activeSvg.match(/\bwidth="(\d+(?:\.\d+)?)"/)?.[1];
        const h = activeSvg.match(/\bheight="(\d+(?:\.\d+)?)"/)?.[1];
        if (w && h) return { w: parseFloat(w), h: parseFloat(h) };
        const vb = activeSvg.match(/viewBox="[^"]*\s(\d+(?:\.\d+)?)\s(\d+(?:\.\d+)?)"/);
        return vb ? { w: parseFloat(vb[1]), h: parseFloat(vb[2]) } : null;
    }, [activeSvg, isSequence, mermaidDims]);
    // Inline sync avoids SWC/Linux minifier TDZ bug (useEffect([svgDims]) gets hoisted before declaration)


    const fitZoom = useCallback(() => {
        if (!canvasRef.current || !svgDims) return;
        const { clientWidth: cw, clientHeight: ch } = canvasRef.current;
        const fitW = (cw - 48) / svgDims.w;
        const fitH = (ch - 48) / svgDims.h;
        // Wide sequences (gitGraph, gantt, timeline): fit to height, pan horizontally
        const wide = svgDims.w > svgDims.h * 2.5;
        const newZoom = parseFloat((wide ? Math.min(fitH, 1.5) : Math.min(fitW, fitH)).toFixed(3));
        zoomRef.current = newZoom;
        panRef.current = { x: 0, y: 0 };
        applyTransform(panRef.current, zoomRef.current);
        setZoom(newZoom); setPanX(0); setPanY(0); setFitActive(true);
    }, [svgDims, applyTransform]);

    useEffect(() => {
        if (svgDims && !hasFit) {
            const id = requestAnimationFrame(() => { fitZoom(); setHasFit(true); });
            return () => cancelAnimationFrame(id);
        }
    }, [svgDims, hasFit, fitZoom]);

    // Highlight selected participant box - adds a blue outline rect ON TOP of the existing box
    // (does not overwrite the original black border)
    useEffect(() => {
        if (!svgWrapRef.current) return;
        const groups = svgWrapRef.current.querySelectorAll<SVGElement>("[data-pid]");
        groups.forEach(g => {
            // Remove any prior highlight overlay
            g.querySelector(".pid-highlight")?.remove();
            if (g.getAttribute("data-pid") !== selectedPid) return;
            const rect = g.querySelector<SVGRectElement>("rect");
            if (!rect) return;
            const x = parseFloat(rect.getAttribute("x") || "0");
            const y = parseFloat(rect.getAttribute("y") || "0");
            const w = parseFloat(rect.getAttribute("width") || "0");
            const h = parseFloat(rect.getAttribute("height") || "0");
            const r = parseFloat(rect.getAttribute("rx") || "0");
            const offset = 4;
            const ns = "http://www.w3.org/2000/svg";
            const overlay = document.createElementNS(ns, "rect");
            overlay.setAttribute("class", "pid-highlight");
            overlay.setAttribute("x", String(x - offset));
            overlay.setAttribute("y", String(y - offset));
            overlay.setAttribute("width", String(w + offset * 2));
            overlay.setAttribute("height", String(h + offset * 2));
            overlay.setAttribute("rx", String(r + offset));
            overlay.setAttribute("fill", "none");
            overlay.setAttribute("stroke", "#3b82f6");
            overlay.setAttribute("stroke-width", "2.5");
            overlay.setAttribute("pointer-events", "none");
            overlay.style.filter = "drop-shadow(0 0 6px rgba(59,130,246,0.55))";
            g.appendChild(overlay);
        });
    }, [selectedPid, activeSvg]);

    // When a participant is clicked, auto-open the Format panel and switch to Components tab
    useEffect(() => {
        if (!selectedPid) return;
        setShowSettings(true);
        setSettingsTab("components");
        // Scroll the matching icon row into view after the panel renders
        const id = requestAnimationFrame(() => {
            document.querySelector(`[data-icon-row="${CSS.escape(selectedPid)}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return () => cancelAnimationFrame(id);
    }, [selectedPid]);

    const panelMounted = useRef(false);
    useEffect(() => {
        if (!panelMounted.current) { panelMounted.current = true; return; }
        const id = requestAnimationFrame(() => { if (fitActiveRef.current) fitZoom(); });
        return () => cancelAnimationFrame(id);
    }, [showSettings, showCode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Keep body background in sync with canvas colour ───────────────────
    useEffect(() => {
        const bg = (UI_THEMES[opts.theme] ?? UI_THEMES.light).canvasBg;
        document.body.style.background = bg;
        document.documentElement.style.background = bg;
        return () => { document.body.style.background = ""; document.documentElement.style.background = ""; };
    }, [opts.theme]);

    // ── Re-fit on resize / orientation change ─────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        let tid: ReturnType<typeof setTimeout>;
        const onResize = () => { clearTimeout(tid); tid = setTimeout(() => { if (fitActiveRef.current) fitZoom(); }, 120); };
        window.addEventListener("resize", onResize);
        screen.orientation?.addEventListener("change", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            screen.orientation?.removeEventListener("change", onResize);
            clearTimeout(tid);
        };
    }, [mounted, fitZoom]);

    // ── Keyboard shortcuts (Figma-like) ───────────────────────────────────
    useEffect(() => {
        if (!mounted) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (e.key === "Escape") { setShowCode(false); setShowSettings(false); return; }
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key === "s") { e.preventDefault(); saveDiagramRef.current?.(); return; }
            if (tag === "TEXTAREA" || tag === "INPUT") return;
            if (mod && e.key === "0") { e.preventDefault(); fitZoom(); }
            if (mod && e.key === "z" && !e.shiftKey) { const prev = undoStack.current.pop(); if (prev) { e.preventDefault(); setOpts(prev); } }
            if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); const nz = zoomStep(zoomRef.current, "in"); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); flashZoomHud(nz); }
            if (mod && e.key === "-") { e.preventDefault(); const nz = zoomStep(zoomRef.current, "out"); zoomRef.current = nz; applyTransform(panRef.current, nz); setZoom(nz); setFitActive(false); flashZoomHud(nz); }
            if (e.key === "f" || e.key === "F") fitZoom();
            if (e.key === " " && !e.repeat) { e.preventDefault(); spaceHeld.current = true; }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === " ") spaceHeld.current = false;
        };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
    }, [mounted, fitZoom]); // eslint-disable-line react-hooks/exhaustive-deps

    const undoStack = useRef<Opts[]>([]);
    const saveDiagramRef = useRef<(() => void) | null>(null);
    const saveSettings = useCallback((newOpts: Opts, newLayout: Layout) => {
        if (!savedDiagramId || !isOwner) return;
        fetch(`/api/sequences/${savedDiagramId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: { opts: newOpts, layout: newLayout } }),
        }).catch(() => {});
    }, [savedDiagramId, isOwner]);

    const upd = (p: Partial<Opts>) => setOpts(o => {
        pushUndo(undoStack.current, o);
        const next = { ...o, ...p };
        saveSettings(next, layout);
        return next;
    });
    const updL = (p: Partial<Layout>) => setLayout(l => {
        const next = { ...l, ...p };
        saveSettings(opts, next);
        return next;
    });

    // ── Exports ───────────────────────────────────────────────────────────
    const exportFilename = (ext: string) => {
        const title = (diagram.title ?? "sequence").replace(/[^a-z0-9]/gi, "-").toLowerCase();
        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 5).replace(":", "-");
        return `${title}-${date}-${time}.${ext}`;
    };

    // Rasterizes the current SVG to a PNG blob at `scale`.
    //
    // The SVG is handed to the <img> as a data: URL, NOT a blob: URL. The CSP
    // is `img-src 'self' data: https:` - no blob: - so an object URL is refused
    // outright ("violates the following Content Security Policy directive") and
    // the image never loads. data: is already allowed, so this needs no CSP
    // change. Getting this wrong fails silently: onload never fires.
    const rasterize = useCallback((svgStr: string, scale: number): Promise<Blob> => {
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement("canvas");
                c.width = img.width * scale; c.height = img.height * scale;
                const ctx = c.getContext("2d");
                if (!ctx) { reject(new Error("no 2d context")); return; }
                ctx.scale(scale, scale);
                ctx.fillStyle = THEMES[opts.theme]?.bg ?? "#ffffff";
                ctx.fillRect(0, 0, img.width, img.height);
                ctx.drawImage(img, 0, 0);
                c.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/png");
            };
            img.onerror = () => reject(new Error("could not rasterize the SVG"));
            img.src = dataUrl;
        });
    }, [opts]);

    const exportPng = useCallback(() => {
        const svgStr = activeSvg;
        if (!svgStr) return;
        rasterize(svgStr, 2)
            .then(b => {
                const a = document.createElement("a");
                const url = URL.createObjectURL(b);
                a.href = url; a.download = exportFilename("png"); a.click();
                URL.revokeObjectURL(url);
            })
            .catch(() => showToast("Could not render the PNG", { color: "#ef4444" }));
    }, [activeSvg, rasterize]);

    // Puts the rendered diagram on the clipboard as a high-resolution PNG so it
    // can be pasted straight into Slack, Docs, Keynote or a ticket. Rasterized
    // at 3x (the PNG download uses 2x) so it stays sharp on a retina screen and
    // when a slide scales it up. PNG rather than the SVG markup on purpose:
    // browsers only accept image/png as an image on the clipboard, and apps
    // that also see text/plain paste the markup as text instead of the picture.
    // The Code button already copies the source for that case.
    const copyImage = useCallback(() => {
        const svgStr = activeSvg;
        if (!svgStr) { showToast("Paste a diagram first", { color: "#f59e0b" }); return; }

        if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
            showToast("Clipboard images are not supported here - use PNG", { color: "#f59e0b" });
            return;
        }
        // ClipboardItem has to be constructed inside the click itself (Safari
        // drops the user gesture across an await), so hand it the pending
        // promise rather than resolving the blob first.
        navigator.clipboard.write([new ClipboardItem({ "image/png": rasterize(svgStr, 3) })])
            .then(() => { setCopiedImage(true); setTimeout(() => setCopiedImage(false), 1500); })
            .catch(() => showToast("Copy failed - use the PNG download", { color: "#ef4444" }));
    }, [activeSvg, rasterize]);

    const exportCode = useCallback(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
        a.download = exportFilename("txt"); a.click();
    }, [code]);

    const exportJson = useCallback(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(diagram, null, 2)], { type: "application/json" }));
        a.download = exportFilename("json"); a.click();
    }, [diagram]);

    const exportSvg = useCallback(() => {
        if (!savedDiagramId) { showToast("Save the diagram first", { color: "#f59e0b" }); return; }
        window.open(`${PROD_URL}/svg/${savedDiagramId}`, "_blank");
    }, [savedDiagramId]);

    const autoIcons = useCallback(async () => {
        if (!diagram.participants.length) return;
        showToast("Picking icons…", { color: "#3b82f6" });
        try {
            const iconKeys = Object.keys(ICON_NODES);
            const res = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `You are an icon picker. Given these sequence diagram participants and the diagram code, pick the best icon for each participant from this list ONLY: ${iconKeys.join(", ")}

Diagram code:
${code}

Participants: ${diagram.participants.map(p => `${p.id} (label: "${p.label}")`).join(", ")}

Return ONLY a JSON object mapping participant ID to icon key. Example: {"U":"user","S":"server","DB":"database"}
No explanation, no markdown, just the JSON object.`,
                }),
            });
            if (!res.ok) throw new Error("AI request failed");
            const data = await res.json();
            // The AI generate endpoint returns {code} - but we sent a special prompt
            // Parse the response to find the JSON mapping
            const text = data.code || data.title || JSON.stringify(data);
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON in response");
            const mapping = JSON.parse(jsonMatch[0]);
            // Validate and apply
            const newIcons: Record<string, string> = { ...opts.icons };
            for (const [pid, icon] of Object.entries(mapping)) {
                if (typeof icon === "string" && ICON_NODES[icon]) {
                    newIcons[pid] = icon;
                }
            }
            upd({ icons: newIcons });
            showToast("Icons updated ✓", { color: "#22c55e" });
        } catch {
            // Fallback: use the regex-based guessIconKey
            const newIcons: Record<string, string> = {};
            diagram.participants.forEach(p => {
                newIcons[p.id] = guessIconKey(p.label);
            });
            upd({ icons: newIcons });
            showToast("Icons set (fallback)", { color: "#f59e0b" });
        }
    }, [code, diagram.participants, opts.icons, upd]);

    const copyCode = useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [code]);

    const saveDiagram = useCallback(async (codeToSave?: string) => {
        if (!isOwner) return;
        const c = codeToSave ?? code;
        if (!c.trim()) return; // don't save empty/placeholder
        const title = extractTitle(c);
        const dtype = detectSequenceType(c);
        showToast("Saving…", { color: "#6366f1" });
        try {
            const res = await fetch("/api/sequences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, code: c, sequenceType: dtype }),
            });
            const result = await res.json();
            if (!res.ok) {
                showToast(`Error: ${result.error}`, { color: "#ef4444" });
            } else {
                showToast("Saved ✓", { color: "#16a34a" });
                if (result?.id) {
                    setSavedDiagramId(result.id);
                    const viewParam = new URLSearchParams(window.location.search).get("view") === "1" ? "&view=1" : "";
                    history.replaceState(null, "", `/?id=${result.id}${viewParam}`);
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            showToast(`Save failed: ${msg}`, { color: "#ef4444" });
        }
    }, [isOwner, code]);

    // Keep ref in sync so keydown handler (stale closure) can call latest saveDiagram
    useEffect(() => { saveDiagramRef.current = () => saveDiagram(); }, [saveDiagram]);

    // ── Autosave on code change (update existing record) ──────────────────
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!isOwner || !savedDiagramId || !code.trim()) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            fetch(`/api/sequences/${savedDiagramId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            }).catch(() => {});
        }, 1500);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [code, savedDiagramId, isOwner]);

    const PROD_URL = "https://sequences-bheng.vercel.app";
    const buildShareUrl = useCallback(() => {
        if (savedDiagramId) return `${PROD_URL}/d/${savedDiagramId}`;
        return null; // not saved yet
    }, [savedDiagramId]);

    const buildViewUrl = useCallback(() => {
        if (!savedDiagramId) return null;
        return `${PROD_URL}/d/${savedDiagramId}`;
    }, [savedDiagramId]);

    const copyLink = useCallback(() => {
        const url = buildShareUrl();
        if (!url) { showToast("Paste a diagram first to get a link", { color: "#f59e0b" }); return; }
        const confirm = () => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500); };
        const fallback = () => {
            try {
                const ta = document.createElement("textarea");
                ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0";
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                confirm();
            } catch { /* ignore */ }
        };
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(confirm).catch(fallback);
        } else {
            fallback();
        }
    }, [buildShareUrl]);

    const share = useCallback(() => {
        const url = buildShareUrl();
        if (!url) { showToast("Paste a diagram first to share", { color: "#f59e0b" }); return; }
        if (navigator.share) {
            navigator.share({ title: "Diagram", url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url).then(() => {
                setCopiedShare(true);
                setTimeout(() => setCopiedShare(false), 1500);
            });
        }
    }, [buildShareUrl]);

    const fireConfetti = useCallback(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        import("canvas-confetti").then(({ default: confetti }) => {
            const end = Date.now() + 1500;
            const colors = ["#ff595e","#ffca3a","#22c55e","#1982c4","#8ac926","#ff924c","#48cae4","#f97316"];
            let last = 0;
            const burst = (ts: number) => {
                if (ts - last > 50) {
                    last = ts;
                    // Snow-like fall from top across the full width
                    confetti({ particleCount: 8, angle: 270, spread: 60, startVelocity: 12, gravity: 0.9, drift: 1.2, ticks: 180, origin: { x: Math.random(), y: 0 }, colors });
                    confetti({ particleCount: 8, angle: 270, spread: 60, startVelocity: 14, gravity: 0.9, drift: -1.2, ticks: 180, origin: { x: Math.random(), y: 0 }, colors });
                }
                if (Date.now() < end) requestAnimationFrame(burst);
                else confetti.reset();
            };
            requestAnimationFrame(burst);
        });
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
        const pasted = e.clipboardData.getData("text");
        const parsed = parse(pasted);
        if (parsed.participants.length >= 2) setTimeout(fireConfetti, 150);
        setTimeout(fitZoom, 120);
        // Don't save here - onGlobalPaste (capture phase) already handles diagram saves
    }, [fireConfetti, fitZoom]);

    // ── Global paste listener - always intercepts sequence sequences, creates new record ──
    useEffect(() => {
        const onGlobalPaste = (e: ClipboardEvent) => {
            const pasted = e.clipboardData?.getData("text") ?? "";
            if (!pasted.trim()) return;
            const looksLikeSequence = /^sequenceDiagram/im.test(stripFrontmatter(pasted));
            const looksLikeDiagram = /^(sequenceDiagram|flowchart|graph\s|classDiagram|erDiagram|gantt|pie|mindmap|gitGraph|journey)/im.test(stripFrontmatter(pasted));
            if (!looksLikeSequence) {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag !== "TEXTAREA" && tag !== "INPUT") showToast(looksLikeDiagram ? "Only sequence sequences supported" : "Not a diagram", { color: "#ef4444" });
                return;
            }
            // Always intercept - prevent textarea from inserting raw text
            e.preventDefault();
            setCode(pasted);
            setSavedDiagramId(null);
            const pastedTitle = pasted.match(/^(?:title|accTitle):?\s+(.+)$/im)?.[1]?.trim() ?? "Diagram loaded";
            showToast(pastedTitle, { color: "#7c3aed", confetti: true });
            setTimeout(fireConfetti, 150);
            setTimeout(fitZoom, 120);
            // Always save as a NEW record
            if (isOwner) setTimeout(() => saveDiagram(pasted), 300);
        };
        document.addEventListener("paste", onGlobalPaste, true);
        return () => document.removeEventListener("paste", onGlobalPaste, true);
    }, [fireConfetti, fitZoom, isOwner, saveDiagram]);

    const ut = UI_THEMES[opts.theme] ?? UI_THEMES.light;

    // ── Presenter mode ────────────────────────────────────────────────────
    const presenterSelectedEl = useRef<SVGElement | null>(null);
    const spotlightRef = useRef<HTMLDivElement | null>(null);
    const spotlightActiveRef = useRef(false);

    const enterPresenter = useCallback(() => {
        setViewMode(true);
        document.documentElement.requestFullscreen?.().catch(() => {});
    }, []);

    const exitPresenter = useCallback(() => {
        if (presenterSelectedEl.current) {
            presenterSelectedEl.current.style.filter = "";
            presenterSelectedEl.current.style.stroke = "";
            presenterSelectedEl.current = null;
        }
        setViewMode(false);
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }, []);

    const presenterEscRef = useRef(false);
    const presenterEscTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [presenterEscPending, setPresenterEscPending] = useState(false);

    useEffect(() => {
        if (!viewMode) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (presenterEscRef.current) {
                // Second Esc - exit
                presenterEscRef.current = false;
                setPresenterEscPending(false);
                if (presenterEscTimerRef.current) clearTimeout(presenterEscTimerRef.current);
                exitPresenter();
            } else {
                // First Esc - warn
                presenterEscRef.current = true;
                setPresenterEscPending(true);
                presenterEscTimerRef.current = setTimeout(() => {
                    presenterEscRef.current = false;
                    setPresenterEscPending(false);
                }, 2000);
            }
        };
        document.addEventListener("keydown", handler, true);
        return () => document.removeEventListener("keydown", handler, true);
    }, [viewMode, exitPresenter]);

    const handlePresenterClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as SVGElement;
        // Clear previous highlight
        if (presenterSelectedEl.current) {
            presenterSelectedEl.current.style.filter = "";
            presenterSelectedEl.current.style.opacity = "";
            presenterSelectedEl.current = null;
        }
        // Skip if click is on the SVG background rect (first child of svg)
        const svg = svgWrapRef.current?.querySelector("svg");
        if (!svg || target === svg || target === svg.firstElementChild) return;
        // Find nearest highlightable element
        const el = target.closest("rect, line, polyline, polygon, path, circle, text") as SVGElement | null;
        if (!el || el === svg.firstElementChild) return;
        presenterSelectedEl.current = el;
        el.style.filter = "drop-shadow(0 0 8px #FFD866) drop-shadow(0 0 20px rgba(255,216,102,0.7))";
    }, []);

    // ── Presentation / view-only mode ─────────────────────────────────────
    if (viewMode) {
        const stepHeight = layout.stepHeight;
        return (
            <div
                ref={canvasRef}
                style={{ position: "relative", width: "100svw", height: "100svh", overflow: "hidden", background: "#e8eaf0", fontFamily: "var(--font-roboto), sans-serif", cursor: isMobile ? "default" : "crosshair", touchAction: "none", userSelect: "none" }}
                onMouseMove={e => {
                    const rect = canvasRef.current!.getBoundingClientRect();
                    // Spotlight: update gradient center directly - no React re-render
                    if (spotlightActiveRef.current && spotlightRef.current) {
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        spotlightRef.current.style.background = `radial-gradient(circle 140px at ${x}px ${y}px, transparent 0%, transparent 139px, rgba(0,0,0,0.65) 140px)`;
                    }
                }}
                onMouseLeave={() => {
                    if (spotlightActiveRef.current) {
                        spotlightActiveRef.current = false;
                        if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
                        if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
                    }
                }}
                onMouseDown={e => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    // Left-click hold → spotlight mode
                    spotlightActiveRef.current = true;
                    if (spotlightRef.current) {
                        const rect = canvasRef.current!.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        spotlightRef.current.style.background = `radial-gradient(circle 140px at ${x}px ${y}px, transparent 0%, transparent 139px, rgba(0,0,0,0.65) 140px)`;
                        spotlightRef.current.style.opacity = "1";
                    }
                }}
                onMouseUp={e => {
                    if (e.button !== 0) return;
                    if (spotlightActiveRef.current) {
                        spotlightActiveRef.current = false;
                        if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
                        if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
                        return; // don't fire click highlight when releasing spotlight
                    }
                }}
                onClick={e => {
                    if (!spotlightActiveRef.current) handlePresenterClick(e);
                }}
                onWheel={e => {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        const rect = canvasRef.current!.getBoundingClientRect();
                        const ox = e.clientX - (rect.left + rect.width / 2);
                        const oy = e.clientY - (rect.top + rect.height / 2);
                        // 10x smoother: speed-based instead of fixed multiplier
                        const speed = e.deltaMode === 1 ? 0.036 : 0.0024;
                        const oldZoom = zoomRef.current;
                        const newZoom = parseFloat(Math.min(4, Math.max(0.2, oldZoom - e.deltaY * speed * oldZoom)).toFixed(4));
                        const ratio = newZoom / oldZoom;
                        zoomRef.current = newZoom;
                        panRef.current = { x: ox * (1 - ratio) + panRef.current.x * ratio, y: oy * (1 - ratio) + panRef.current.y * ratio };
                        applyTransform(panRef.current, newZoom);
                        flashZoomHud(newZoom);
                    } else {
                        const hw = window.innerWidth / 2, hh = window.innerHeight / 2;
                        const nx = panRef.current.x - e.deltaX;
                        const ny = panRef.current.y - e.deltaY;
                        panRef.current = { x: Math.max(-hw, Math.min(hw, nx)), y: Math.max(-hh, Math.min(hh, ny)) };
                        applyTransform(panRef.current, zoomRef.current);
                    }
                    if (viewWheelTimer.current) clearTimeout(viewWheelTimer.current);
                    viewWheelTimer.current = setTimeout(() => { syncTransformState(); setFitActive(false); }, 150);
                }}
            >

                {mounted && isSequence && activeSvg && (
                    <div ref={svgWrapRef} style={{ position: "absolute", top: "50%", left: "50%", cursor: "default", willChange: "transform" }}
                        dangerouslySetInnerHTML={{ __html: activeSvg }}
                    />
                )}

                {mounted && !isSequence && deferredCode.trim() && (
                    <div ref={svgWrapRef} style={{ position: "absolute", top: "50%", left: "50%", cursor: "default", willChange: "transform" }}>
                        <div style={{ background: "#ffffff", borderRadius: 18, boxShadow: "0 4px 40px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)", padding: "48px 56px", minWidth: 480 }}>
                            <MermaidRenderer code={deferredCode} dark={opts.theme === "dark"} onDims={(w, h) => { setMermaidDims({ w: w + 112, h: h + 96 }); setHasFit(false); }} />
                        </div>
                    </div>
                )}

                {/* Zoom HUD */}
                <div ref={zoomHudRef} style={{
                    position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)",
                    background: "rgba(10,10,15,0.72)", backdropFilter: "blur(12px)",
                    color: "#fff", borderRadius: 100, padding: "7px 20px",
                    fontSize: 15, fontWeight: 700, letterSpacing: "0.02em",
                    opacity: 0, transition: "opacity 0.2s ease", pointerEvents: "none",
                    zIndex: 50, boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                }} />

                {/* Spotlight overlay - updated directly via DOM, no React re-renders */}
                <div ref={spotlightRef} style={{
                    position: "absolute", inset: 0, zIndex: 16, pointerEvents: "none",
                    opacity: 0, transition: "opacity 0.15s ease",
                    background: "radial-gradient(circle 140px at 50% 50%, transparent 0%, transparent 139px, rgba(0,0,0,0.65) 140px)",
                }} />


                {/* Esc-pending toast */}
                {presenterEscPending && (
                    <div style={{
                        position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)",
                        background: "rgba(20,20,30,0.88)", border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12, color: "#f8fafc", fontSize: 13, fontWeight: 600,
                        padding: "8px 20px", zIndex: 30, backdropFilter: "blur(8px)",
                        pointerEvents: "none", letterSpacing: "0.02em",
                    }}>
                        Press Esc again to exit presenter
                    </div>
                )}

            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ fontFamily: "var(--font-roboto), sans-serif" }}>
            <CuteToast />

            {/* ── Diagram loading overlay ── */}
            {diagramLoading && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 999,
                    background: "rgba(8,8,18,0.55)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
                    backdropFilter: "blur(3px)",
                }}>
                    <style>{`
                        /* total loop: 5s */
                        /* ── boxes ── */
                        @keyframes sdB1 {
                            0%,100%{opacity:0;transform:scale(0.3)}
                            6%{opacity:1;transform:scale(1.08)}
                            9%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0;transform:scale(0.8)}
                        }
                        @keyframes sdB2 {
                            0%,7%,100%{opacity:0;transform:scale(0.3)}
                            14%{opacity:1;transform:scale(1.08)}
                            17%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0;transform:scale(0.8)}
                        }
                        @keyframes sdB3 {
                            0%,14%,100%{opacity:0;transform:scale(0.3)}
                            21%{opacity:1;transform:scale(1.08)}
                            24%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0;transform:scale(0.8)}
                        }
                        /* ── lifelines draw down ── */
                        @keyframes sdLL {
                            0%,22%,100%{stroke-dashoffset:145}
                            36%{stroke-dashoffset:0}
                            82%{stroke-dashoffset:0}
                            90%{stroke-dashoffset:145}
                        }
                        /* ── arrow lines draw right ── */
                        @keyframes sdA1 {
                            0%,34%,100%{stroke-dashoffset:96}
                            42%{stroke-dashoffset:0}
                            82%{stroke-dashoffset:0}
                            90%{stroke-dashoffset:96}
                        }
                        @keyframes sdA2 {
                            0%,46%,100%{stroke-dashoffset:96}
                            54%{stroke-dashoffset:0}
                            82%{stroke-dashoffset:0}
                            90%{stroke-dashoffset:96}
                        }
                        /* ── dashed return lines ── */
                        @keyframes sdA3 {
                            0%,56%,100%{opacity:0}
                            64%{opacity:1}
                            82%{opacity:1}
                            90%{opacity:0}
                        }
                        @keyframes sdA4 {
                            0%,66%,100%{opacity:0}
                            74%{opacity:1}
                            82%{opacity:1}
                            90%{opacity:0}
                        }
                        /* ── pills pop in ── */
                        @keyframes sdP1 {
                            0%,40%,100%{opacity:0;transform:scale(0.4)}
                            46%{opacity:1;transform:scale(1.1)}
                            49%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0}
                        }
                        @keyframes sdP2 {
                            0%,52%,100%{opacity:0;transform:scale(0.4)}
                            58%{opacity:1;transform:scale(1.1)}
                            61%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0}
                        }
                        @keyframes sdP3 {
                            0%,62%,100%{opacity:0;transform:scale(0.4)}
                            68%{opacity:1;transform:scale(1.1)}
                            71%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0}
                        }
                        @keyframes sdP4 {
                            0%,72%,100%{opacity:0;transform:scale(0.4)}
                            78%{opacity:1;transform:scale(1.1)}
                            81%{opacity:1;transform:scale(1)}
                            82%{opacity:1;transform:scale(1)}
                            90%{opacity:0}
                        }
                        /* ── bottom boxes (mirror of top) ── */
                        @keyframes sdBBot {
                            0%,22%,100%{opacity:0}
                            28%{opacity:1}
                            82%{opacity:1}
                            90%{opacity:0}
                        }
                        /* ── label text fade ── */
                        @keyframes sdLbl {
                            0%,82%{opacity:1}
                            90%,100%{opacity:0}
                        }
                    `}</style>

                    {/* ── animated sequence diagram ── */}
                    <svg width={300} height={190} viewBox="0 0 300 190" style={{ filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.6))" }}>
                        {/* ─ participant boxes top ─ */}
                        <g style={{ transformOrigin: "50px 14px", animation: "sdB1 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={10} y={1} width={80} height={26} rx={7} fill="#fb7185"/>
                            <text x={50} y={14} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={9} fontWeight={700} fill="white">Client</text>
                        </g>
                        <g style={{ transformOrigin: "150px 14px", animation: "sdB2 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={110} y={1} width={80} height={26} rx={7} fill="#a78bfa"/>
                            <text x={150} y={14} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={9} fontWeight={700} fill="white">API</text>
                        </g>
                        <g style={{ transformOrigin: "250px 14px", animation: "sdB3 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={210} y={1} width={80} height={26} rx={7} fill="#34d399"/>
                            <text x={250} y={14} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={9} fontWeight={700} fill="white">DB</text>
                        </g>

                        {/* ─ lifelines ─ */}
                        <line x1={50}  y1={27} x2={50}  y2={168} stroke="#fb7185" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="145" style={{ animation: "sdLL 2.5s ease-out infinite" }}/>
                        <line x1={150} y1={27} x2={150} y2={168} stroke="#a78bfa" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="145" style={{ animation: "sdLL 2.5s ease-out 0.025s infinite" }}/>
                        <line x1={250} y1={27} x2={250} y2={168} stroke="#34d399" strokeWidth={1.5} strokeOpacity={0.4} strokeDasharray="145" style={{ animation: "sdLL 2.5s ease-out 0.05s infinite" }}/>

                        {/* ─ Arrow 1: Client→API (amber) ─ */}
                        <line x1={50} y1={65} x2={140} y2={65} stroke="#fbbf24" strokeWidth={2} strokeDasharray="96" style={{ animation: "sdA1 2.5s ease-out infinite" }}/>
                        <polygon points="144,65 134,60 134,70" fill="#fbbf24" style={{ animation: "sdP1 2.5s ease-out infinite", transformOrigin: "144px 65px" }}/>
                        <g style={{ transformOrigin: "95px 65px", animation: "sdP1 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={57} y={57} width={76} height={16} rx={8} fill="#fbbf24"/>
                            <text x={95} y={65} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={8} fontWeight={700} fill="#000">POST /data</text>
                        </g>

                        {/* ─ Arrow 2: API→DB (sky) ─ */}
                        <line x1={150} y1={100} x2={240} y2={100} stroke="#38bdf8" strokeWidth={2} strokeDasharray="96" style={{ animation: "sdA2 2.5s ease-out infinite" }}/>
                        <polygon points="244,100 234,95 234,105" fill="#38bdf8" style={{ animation: "sdP2 2.5s ease-out infinite", transformOrigin: "244px 100px" }}/>
                        <g style={{ transformOrigin: "197px 100px", animation: "sdP2 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={159} y={92} width={76} height={16} rx={8} fill="#38bdf8"/>
                            <text x={197} y={100} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={8} fontWeight={700} fill="#000">INSERT row</text>
                        </g>

                        {/* ─ Arrow 3: DB→API return dashed (teal) ─ */}
                        <line x1={240} y1={128} x2={160} y2={128} stroke="#34d399" strokeWidth={1.5} strokeDasharray="5 4" style={{ animation: "sdA3 2.5s ease-out infinite" }}/>
                        <polygon points="156,128 166,123 166,133" fill="#34d399" style={{ animation: "sdA3 2.5s ease-out infinite" }}/>
                        <g style={{ transformOrigin: "200px 128px", animation: "sdP3 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={162} y={120} width={76} height={16} rx={8} fill="#34d399" fillOpacity={0.85}/>
                            <text x={200} y={128} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={8} fontWeight={700} fill="#000">201 created</text>
                        </g>

                        {/* ─ Arrow 4: API→Client return dashed (violet) ─ */}
                        <line x1={140} y1={155} x2={60} y2={155} stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 4" style={{ animation: "sdA4 2.5s ease-out infinite" }}/>
                        <polygon points="56,155 66,150 66,160" fill="#a78bfa" style={{ animation: "sdA4 2.5s ease-out infinite" }}/>
                        <g style={{ transformOrigin: "100px 155px", animation: "sdP4 2.5s cubic-bezier(0.34,1.56,0.64,1) infinite" }}>
                            <rect x={62} y={147} width={76} height={16} rx={8} fill="#a78bfa" fillOpacity={0.85}/>
                            <text x={100} y={155} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-roboto),system-ui,sans-serif" fontSize={8} fontWeight={700} fill="#000">200 ok ✓</text>
                        </g>

                        {/* ─ participant boxes bottom ─ */}
                        <g style={{ animation: "sdBBot 2.5s ease-out infinite" }}>
                            <rect x={10}  y={170} width={80} height={18} rx={5} fill="#fb7185" fillOpacity={0.7}/>
                            <rect x={110} y={170} width={80} height={18} rx={5} fill="#a78bfa" fillOpacity={0.7}/>
                            <rect x={210} y={170} width={80} height={18} rx={5} fill="#34d399" fillOpacity={0.7}/>
                        </g>
                    </svg>

                    {/* label */}
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "rgba(180,185,220,0.8)", letterSpacing: "0.04em", animation: "sdLbl 2.5s ease-out infinite" }}>
                        Building diagram…
                    </p>
                </div>
            )}
            <style>{`
                ${opts.theme === "light" ? `
                .token.comment     { color: #6e7781; font-style: italic; }
                .token.keyword     { color: #cf222e; font-weight: 600; }
                .token.arrow       { color: #0969da; }
                .token.string      { color: #0a3069; }
                .token.number      { color: #8250df; }
                .token.operator    { color: #953800; }
                .token.punctuation { color: #6e7781; }
                ` : `
                .token.comment     { color: #727072; font-style: italic; }
                .token.keyword     { color: #FF6188; font-weight: 600; }
                .token.arrow       { color: #78DCE8; }
                .token.string      { color: #FFD866; }
                .token.number      { color: #AB9DF2; }
                .token.operator    { color: #FC9867; }
                .token.punctuation { color: #727072; }
                `}
                input[type="range"] { background: ${ut.divider}; }
                input[type="range"]::-webkit-slider-thumb { background: ${ut.accent}; }
                input[type="range"]::-moz-range-thumb { background: ${ut.accent}; border: none; }
                input[type="range"]::-moz-range-track { background: ${ut.divider}; }
                input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.35); }
                .npm__react-simple-code-editor__textarea { outline: none !important; }
                @keyframes rainbow-pp {
                    0%   { color: #FF6188; }
                    16%  { color: #FC9867; }
                    33%  { color: #FFD866; }
                    50%  { color: #A9DC76; }
                    66%  { color: #78DCE8; }
                    83%  { color: #AB9DF2; }
                    100% { color: #FF6188; }
                }
                .rainbow-pp { animation: rainbow-pp 2.5s linear infinite; font-weight: 900; }
            `}</style>

            {/* ── HEADER ── */}
            <header style={{
                height: 54, background: ut.headerBg, borderBottom: opts.theme === "light" ? "none" : `1px solid ${ut.headerBorder}`,
                display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0,
            }}>

                {/* Back - ideas-style floating pill */}
                <button
                    onClick={goBack}
                    aria-label="Back to sequences"
                    style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        border: `1px solid ${ut.headerBorder}`,
                        background: opts.theme === "light" ? "#ffffff" : ut.headerBg,
                        boxShadow: opts.theme === "light" ? "0 2px 8px rgba(0,0,0,0.07)" : "none",
                        color: "#64748b", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = opts.theme === "light" ? "#e9ecef" : ut.activeTab)}
                    onMouseLeave={e => (e.currentTarget.style.background = opts.theme === "light" ? "#ffffff" : ut.headerBg)}
                ><ArrowLeft size={16} strokeWidth={2} /></button>

                <div style={{ flex: 1 }} />

                {/* Action toolbar - ideas-style floating pill */}
                <div style={{
                    display: "flex", alignItems: "center", gap: 2,
                    background: opts.theme === "light" ? "#ffffff" : ut.headerBg,
                    border: `1px solid ${ut.headerBorder}`,
                    borderRadius: 14,
                    boxShadow: opts.theme === "light" ? "0 4px 24px rgba(0,0,0,0.08)" : "none",
                    padding: "4px 6px",
                }}>
                    {/* Code */}
                    <button onClick={() => { setShowCode(v => !v); if (showSettings) setShowSettings(false); }} aria-label="Code" style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "0 10px", height: 30, borderRadius: 8, border: "none",
                        background: showCode ? (opts.theme === "light" ? "#f1f5f9" : ut.activeTab) : "transparent",
                        color: showCode ? (opts.theme === "light" ? "#1e293b" : ut.activeTabText) : "#64748b",
                        cursor: "pointer", fontSize: 13, fontWeight: showCode ? 600 : 400, transition: "all 0.1s",
                    }}
                        onMouseEnter={e => { if (!showCode) e.currentTarget.style.background = opts.theme === "light" ? "#f1f5f9" : ut.activeTab; }}
                        onMouseLeave={e => { if (!showCode) e.currentTarget.style.background = "transparent"; }}
                    >
                        <Code2 size={14} strokeWidth={2} />
                        {!isMobile && "Code"}
                    </button>

                    {/* separator */}
                    <div style={{ width: 1, height: 18, background: ut.headerBorder, flexShrink: 0, margin: "0 2px" }} />

                    {/* Share (public link) */}
                    {savedDiagramId && (
                        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <button onClick={async () => {
                                if (isSharedDiagram) {
                                    const url = `${PROD_URL}/d/${savedDiagramId}`;
                                    navigator.clipboard.writeText(url).catch(() => {});
                                    window.open(url, "_blank");
                                    showToast("Link copied - opening preview", { color: "#7c3aed" });
                                } else {
                                    await fetch(`/api/sequences/${savedDiagramId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_public: true }) });
                                    setIsSharedDiagram(true);
                                    const url = `${PROD_URL}/d/${savedDiagramId}`;
                                    navigator.clipboard.writeText(url).catch(() => {});
                                    showToast("Public link copied!", { color: "#7c3aed" });
                                }
                            }} style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "0 8px", height: 30, borderRadius: isSharedDiagram ? "8px 0 0 8px" : "8px", border: "none",
                                background: isSharedDiagram ? "rgba(124,58,237,0.15)" : "transparent",
                                color: isSharedDiagram ? "#a78bfa" : "#64748b",
                                cursor: "pointer", fontSize: 13, fontWeight: isSharedDiagram ? 600 : 400, transition: "all 0.1s",
                            }}
                                onMouseEnter={e => { if (!isSharedDiagram) e.currentTarget.style.background = opts.theme === "light" ? "#f1f5f9" : ut.activeTab; }}
                                onMouseLeave={e => { if (!isSharedDiagram) e.currentTarget.style.background = "transparent"; }}
                                title={isSharedDiagram ? "Click to preview + copy link" : "Share - make public"}
                                aria-label={isSharedDiagram ? "Public" : "Share"}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                {!isMobile && (isSharedDiagram ? "Public" : "Share")}
                            </button>
                            {isSharedDiagram && (
                                <button onClick={async () => {
                                    await fetch(`/api/sequences/${savedDiagramId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_public: false }) });
                                    setIsSharedDiagram(false);
                                    showToast("No longer public", { color: "#64748b" });
                                }} style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    width: 20, height: 30, borderRadius: "0 8px 8px 0", border: "none",
                                    background: "rgba(124,58,237,0.15)", color: "#a78bfa",
                                    cursor: "pointer", fontSize: 12, transition: "all 0.1s", paddingLeft: 0,
                                }}
                                    title="Make private"
                                    aria-label="Make private"
                                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)", e.currentTarget.style.color = "#f87171")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(124,58,237,0.15)", e.currentTarget.style.color = "#a78bfa")}
                                >✕</button>
                            )}
                        </div>
                    )}

                    {/* separator */}
                    <div style={{ width: 1, height: 18, background: ut.headerBorder, flexShrink: 0, margin: "0 2px" }} />

                    {/* Play */}
                    <button onClick={enterPresenter} aria-label="Play" style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "0 10px", height: 30, borderRadius: 8, border: "none",
                        background: "transparent", color: "#64748b",
                        cursor: "pointer", fontSize: 13, fontWeight: 400, transition: "background 0.1s",
                    }}
                        onMouseEnter={e => (e.currentTarget.style.background = opts.theme === "light" ? "#f1f5f9" : ut.activeTab)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,1 15,8 3,15"/></svg>
                        {!isMobile && "Play"}
                    </button>

                    {/* separator */}
                    <div style={{ width: 1, height: 18, background: ut.headerBorder, flexShrink: 0, margin: "0 2px" }} />

                    {/* Format */}
                    <button onClick={() => { setShowSettings(v => !v); if (showCode && isMobile) setShowCode(false); }} aria-label="Format" style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "0 10px", height: 30, borderRadius: 8, border: "none",
                        background: showSettings ? (opts.theme === "light" ? "#f1f5f9" : ut.activeTab) : "transparent",
                        color: showSettings ? (opts.theme === "light" ? "#1e293b" : ut.activeTabText) : "#64748b",
                        cursor: "pointer", fontSize: 13, fontWeight: showSettings ? 600 : 400, transition: "all 0.1s",
                    }}
                        onMouseEnter={e => { if (!showSettings) e.currentTarget.style.background = opts.theme === "light" ? "#f1f5f9" : ut.activeTab; }}
                        onMouseLeave={e => { if (!showSettings) e.currentTarget.style.background = "transparent"; }}
                    >
                        <SlidersHorizontal size={14} strokeWidth={2} />
                        {!isMobile && "Format"}
                    </button>
                </div>
            </header>

            {/* ── BODY ── */}
            <div className="flex-1 flex overflow-hidden">

                {/* Desktop: Code editor side panel */}
                {!isMobile && showCode && (
                    <div className="flex shrink-0 relative" style={{ width: codeWidth }}>
                        <div className="flex flex-col flex-1 overflow-hidden border-r"
                            style={{
                                background: ut.codeBg,
                                borderColor: ut.codeBorder,
                            }}>
                            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0"
                                style={{
                                    borderColor: ut.codeBorder,
                                    background: ut.codeHeaderBg,
                                }}>
                                <span className="text-[9px] font-bold uppercase tracking-widest"
                                    style={{ color: ut.zoomMuted }}>Code</span>
                                <div className="flex items-center gap-1">
                                    <button onClick={copyCode} title="Copy code"
                                        className="h-6 px-2 rounded flex items-center justify-center text-[10px] font-semibold transition-all"
                                        style={{ color: copied ? ut.toggleOn : ut.zoomMuted, background: copied ? `${ut.toggleOn}22` : "transparent" }}
                                    >{copied ? "Copied" : "Copy"}</button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
                                <Editor
                                    value={code}
                                    onValueChange={setCode}
                                    highlight={highlight}
                                    padding={16}
                                    spellCheck={false}
                                    onPaste={handlePaste}
                                    style={{
                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                        fontSize: "12px",
                                        lineHeight: 1.75,
                                        minHeight: "100%",
                                        color: ut.codeText,
                                    }}
                                />
                            </div>
                        </div>
                        {/* Drag handle */}
                        <div
                            onMouseDown={e => {
                                isResizing.current = true;
                                resizeStartX.current = e.clientX;
                                resizeStartW.current = codeWidth;
                                document.body.style.cursor = "col-resize";
                                document.body.style.userSelect = "none";
                                e.preventDefault();
                            }}
                            className="absolute right-0 top-0 bottom-0 flex items-center justify-center z-10"
                            style={{ width: 8, cursor: "col-resize" }}
                        >
                            <div className="h-12 rounded-full w-1"
                                style={{ background: ut.codeBorder }} />
                        </div>
                    </div>
                )}

                {/* ── Diagram canvas ── */}
                <div className="flex-1 relative" style={{ background: ut.canvasBg }}>
                    <div ref={canvasRef} className="absolute inset-0 overflow-hidden"
                        style={{ cursor: "default", touchAction: "none" }}
                        onMouseDown={e => {
                            if ((e.target as HTMLElement).closest("button,#diagram-title,[data-pid],.mindmap-node,.node,[class*='node']")) return;
                            if (opts.autoLayout) upd({ autoLayout: false });
                            isDragging.current = true;
                            dragStartMouse.current = { x: e.clientX, y: e.clientY };
                            dragStartPan.current = { x: panRef.current.x, y: panRef.current.y };
                            e.preventDefault();
                        }}
                        onDoubleClick={e => {
                            if ((e.target as HTMLElement).closest("#diagram-title")) return;
                        }}
                    >
                        {mounted && isSequence && activeSvg ? (
                            <div
                                ref={svgWrapRef}
                                style={{
                                    position: "absolute",
                                    top: "50%", left: "50%",
                                }}
                                onClick={e => {
                                    const el = (e.target as Element).closest("#diagram-title");
                                    if (el) { setTitleEdit({ value: diagram.title ?? DEFAULT_DIAGRAM_TITLE, rect: el.getBoundingClientRect() }); return; }
                                    const box = (e.target as Element).closest("[data-pid]") as SVGElement | null;
                                    if (box) {
                                        const pid = box.getAttribute("data-pid");
                                        setSelectedPid(prev => (prev === pid ? null : pid));
                                        return;
                                    }
                                    setSelectedPid(null);
                                }}
                                dangerouslySetInnerHTML={{ __html: activeSvg }}
                            />
                        ) : mounted && !isSequence && deferredCode.trim() ? (
                            <div ref={svgWrapRef} style={{ position: "absolute", top: "50%", left: "50%", cursor: "default", willChange: "transform" }}>
                                <div style={{ background: "#ffffff", borderRadius: 18, boxShadow: "0 4px 40px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)", padding: "48px 56px", minWidth: 480 }}>
                                    <MermaidRenderer code={deferredCode} dark={opts.theme === "dark"} onDims={(w, h) => { setMermaidDims({ w: w + 112, h: h + 96 }); setHasFit(false); }} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                {mounted && (
                                    <span className="text-sm text-center px-6" style={{ color: "#94a3b8" }}>
                                        No diagram - open the code editor and enter sequence syntax.
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Zoom HUD - shown during zoom, fades out via direct DOM */}
                    <div ref={zoomHudRef} style={{
                        position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
                        background: "rgba(10,10,15,0.72)", backdropFilter: "blur(12px)",
                        color: "#fff", borderRadius: 100, padding: "7px 20px",
                        fontSize: 15, fontWeight: 700, letterSpacing: "0.02em",
                        opacity: 0, transition: "opacity 0.2s ease", pointerEvents: "none",
                        zIndex: 50, boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                    }} />

                    {/* Title inline editor overlay */}
                    {titleEdit && (
                        <input
                            autoFocus
                            value={titleEdit.value}
                            onChange={e => setTitleEdit(t => t ? { ...t, value: e.target.value } : null)}
                            onBlur={e => commitTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") commitTitle((e.target as HTMLInputElement).value); if (e.key === "Escape") setTitleEdit(null); }}
                            style={{
                                position: "fixed",
                                left: titleEdit.rect.left,
                                top: titleEdit.rect.top,
                                width: Math.max(titleEdit.rect.width, 220),
                                height: titleEdit.rect.height || 36,
                                fontSize: 30 * zoom,
                                fontWeight: 800,
                                fontFamily: `'${opts.font}', sans-serif`,
                                color: (UI_THEMES[opts.theme] ?? UI_THEMES.light).bodyText,
                                background: "transparent",
                                border: "none",
                                borderBottom: `2px solid ${(UI_THEMES[opts.theme] ?? UI_THEMES.light).accent}`,
                                outline: "none",
                                padding: 0,
                                lineHeight: 1,
                                zIndex: 100,
                            }}
                        />
                    )}


                </div>

                {/* Desktop: Settings panel */}
                {!isMobile && showSettings && (
                    <div className="shrink-0 flex flex-col" style={{ width: 268, background: ut.panelBg, borderLeft: `1px solid ${ut.panelBorder}` }}>
                            <div className="flex-1 overflow-y-auto" style={{ padding: "12px 12px" }}>
                            <SettingsContent opts={opts} layout={computedLayout} copied={copied} copiedLink={copiedLink} copiedImage={copiedImage} copiedShare={copiedShare} participants={diagram.participants} isSequence={isSequence}
                                upd={upd} updL={updL} exportPng={exportPng} exportSvg={exportSvg} copyImage={copyImage} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} copyLink={copyLink} share={share} viewUrl={mounted ? buildViewUrl() : ""} tab={settingsTab} setTab={setSettingsTab} selectedPid={selectedPid} onAutoIcons={autoIcons} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Mobile: Code editor bottom sheet ── */}
            {isMobile && showCode && (
                <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setShowCode(false)}>
                <div role="dialog" aria-modal="true" className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden" style={{ background: ut.codeBg, maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 shrink-0"
                        style={{ height: 54, background: ut.codeHeaderBg, borderBottom: `1px solid ${ut.codeBorder}` }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ut.zoomMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                            Code Editor
                        </span>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={copyCode}
                                style={{ fontSize: 13, fontWeight: 600, color: copied ? ut.toggleOn : ut.zoomMuted, padding: "6px 0" }}
                            >{copied ? "Copied!" : "Copy"}</button>
                            <button
                                onClick={() => setShowCode(false)}
                                aria-label="Close code editor"
                                className="w-9 h-9 rounded-full flex items-center justify-center"
                                style={{ background: ut.activeTab, color: ut.zoomMuted }}>
                                <X size={16} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
                        <Editor
                            value={code}
                            onValueChange={setCode}
                            highlight={highlight}
                            padding={16}
                            spellCheck={false}
                            onPaste={handlePaste}
                            style={{
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontSize: "16px",
                                lineHeight: 1.8,
                                minHeight: "100%",
                                color: ut.codeText,
                            }}
                        />
                    </div>
                    {/* Done button */}
                    <div className="shrink-0 px-4 py-3" style={{ borderTop: `1px solid ${ut.codeBorder}`, background: ut.codeHeaderBg }}>
                        <button
                            onClick={() => setShowCode(false)}
                            className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                            style={{ background: ut.accent, color: "white" }}
                        >Done</button>
                    </div>
                </div>
                </div>
            )}

            {/* ── Mobile: Settings bottom sheet ── */}
            {isMobile && showSettings && (
                <div
                    className="fixed inset-0 z-50"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                    onClick={() => setShowSettings(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl overflow-hidden"
                        style={{ background: ut.panelBg, maxHeight: "84vh" }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Pull handle */}
                        <div className="flex justify-center pt-3 pb-1 shrink-0">
                            <div style={{ width: 36, height: 4, background: ut.pullHandle, borderRadius: 2 }} />
                        </div>
                        {/* Sheet content */}
                        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 40px" }}>
                            <SettingsContent opts={opts} layout={layout} copied={copied} copiedLink={copiedLink} copiedImage={copiedImage} copiedShare={copiedShare} mobile={true} participants={diagram.participants} isSequence={isSequence}
                                upd={upd} updL={updL} exportPng={exportPng} exportSvg={exportSvg} copyImage={copyImage} exportCode={exportCode} exportJson={exportJson} copyCode={copyCode} copyLink={copyLink} share={share} viewUrl={mounted ? buildViewUrl() : ""} tab={settingsTab} setTab={setSettingsTab} selectedPid={selectedPid} onAutoIcons={autoIcons} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
