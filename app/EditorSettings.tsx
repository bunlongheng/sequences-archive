"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => ({ default: m.QRCodeSVG })), { ssr: false });
import { showToast } from "./CuteToast";
import { assignIconKeys, ICON_NODES } from "@/lib/svg-renderer";
import type { Participant, Opts, Layout } from "@/lib/svg-renderer";

// Page-only: keys list for the IconPicker UI (icon defs imported from lib)
const ICON_KEYS = Object.keys(ICON_NODES);

// ── UI theme palette (editor chrome only — separate from SVG THEMES) ─────────
export type UiTheme = {
    headerBg: string; headerBorder: string; headerText: string;
    canvasBg: string;
    panelBg: string; panelBorder: string;
    tabBarBg: string; activeTab: string; activeTabText: string; inactiveTabText: string;
    sectionLabel: string; bodyText: string; divider: string;
    toggleOn: string; accent: string;
    overlayBtnBg: string; pullHandle: string;
    codeBg: string; codeHeaderBg: string; codeBorder: string; codeText: string;
    zoomBg: string; zoomBorder: string; zoomText: string; zoomMuted: string; zoomDivider: string;
    badgeBg: string; badgeText: string;
};
export const UI_THEMES: Record<string, UiTheme> = {
    light: {
        headerBg: "#f3f4f6",   headerBorder: "#e5e7eb",   headerText: "#374151",
        canvasBg:  "#e8ecf0",
        panelBg:   "#f1f5f9",  panelBorder:  "#e2e8f0",
        tabBarBg:  "#e2e8f0",  activeTab:    "#ffffff",   activeTabText: "#1e293b", inactiveTabText: "#94a3b8",
        sectionLabel: "#94a3b8", bodyText:   "#334155",   divider: "#e2e8f0",
        toggleOn:  "#34c759",  accent:       "#3b82f6",
        overlayBtnBg: "#e8eef5", pullHandle: "#cbd5e1",
        codeBg:    "#ffffff",  codeHeaderBg: "#f8fafc",  codeBorder: "#e2e8f0", codeText: "#1e293b",
        zoomBg:    "white",    zoomBorder:   "#e2e8f0",  zoomText: "#1e293b",   zoomMuted: "#64748b", zoomDivider: "#e2e8f0",
        badgeBg:   "#4b556322", badgeText:   "#4b5563",
    },
    dark: {
        headerBg: "#0d0e14",   headerBorder: "#1e2030",   headerText: "#c0caf5",
        canvasBg:  "#252636",
        panelBg:   "#0f1017",  panelBorder:  "#1e2030",
        tabBarBg:  "#0d0e14",  activeTab:    "#1e2030",   activeTabText: "#c0caf5", inactiveTabText: "#565f89",
        sectionLabel: "#565f89", bodyText:   "#a9b1d6",   divider: "#1e2030",
        toggleOn:  "#34c759",  accent:       "#3b82f6",
        overlayBtnBg: "#1a1b26", pullHandle: "#1e2030",
        codeBg:    "#0d0e14",  codeHeaderBg: "#0a0b10",  codeBorder: "#1e2030", codeText: "#a9b1d6",
        zoomBg:    "#16161e",  zoomBorder:   "#1e2030",  zoomText: "#c0caf5",   zoomMuted: "#565f89", zoomDivider: "#1e2030",
        badgeBg:   "#7aa2f722", badgeText:   "#7aa2f7",
    },
    monokai: {
        headerBg: "#221F22",   headerBorder: "#403E41",   headerText: "#FCFCFA",
        canvasBg:  "#39383C",
        panelBg:   "#2C2B2F",  panelBorder:  "#403E41",
        tabBarBg:  "#221F22",  activeTab:    "#403E41",   activeTabText: "#FCFCFA", inactiveTabText: "#727072",
        sectionLabel: "#727072", bodyText:   "#FCFCFA",   divider: "#403E41",
        toggleOn:  "#34c759",  accent:       "#3b82f6",
        overlayBtnBg: "#221F22", pullHandle: "#403E41",
        codeBg:    "#221F22",  codeHeaderBg: "#19171a",  codeBorder: "#403E41", codeText: "#FCFCFA",
        zoomBg:    "#2D2A2E",  zoomBorder:   "#403E41",  zoomText: "#FCFCFA",   zoomMuted: "#727072", zoomDivider: "#403E41",
        badgeBg:   "#AB9DF222", badgeText:   "#AB9DF2",
    },
};

// ── Slider row ────────────────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, unit = "", fontSize = 12, ut, onChange }: {
    label: string; value: number; min: number; max: number; unit?: string; fontSize?: number; ut: UiTheme; onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <span style={{ fontSize, color: ut.bodyText, fontWeight: 400, whiteSpace: "nowrap", width: 44, flexShrink: 0 }}>{label}</span>
            <input type="range" min={min} max={max} value={value}
                onChange={e => onChange(parseInt(e.target.value))}
                className="flex-1 min-w-0" />
            <span style={{ fontSize, color: ut.sectionLabel, fontWeight: 500, whiteSpace: "nowrap", width: 28, textAlign: "right", flexShrink: 0 }}>{value}{unit}</span>
        </div>
    );
}

// ── Icon button ───────────────────────────────────────────────────────────────
function IconBtn({ active, onClick, accent = "#0a84ff", inactiveBg = "#2a2a2c", color = "white", children }: { active: boolean; onClick: () => void; accent?: string; inactiveBg?: string; color?: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: active ? accent : inactiveBg, color: active ? "white" : color }}
        >{children}</button>
    );
}


// ── Settings content (shared between desktop panel + mobile sheet) ─────────────
// ── Switch - 1 toggle used by every row in the panel ─────────────────────────
// The knob overshoots slightly on the way out (the cubic-bezier below) so the
// control feels sprung rather than linear, and the track keeps a hairline inset
// so an "off" switch still reads as a recessed slot instead of a flat pill.
function Switch({ on, ut, size = "md" }: { on: boolean; ut: UiTheme; size?: "md" | "sm" }) {
    const W = size === "md" ? 36 : 32, H = size === "md" ? 21 : 18;
    const K = H - 5, PAD = 2.5;
    return (
        <div style={{
            position: "relative", width: W, height: H, borderRadius: H / 2, flexShrink: 0,
            background: on ? ut.toggleOn : ut.tabBarBg,
            boxShadow: on ? `0 0 0 1px ${ut.toggleOn}, 0 1px 3px ${ut.toggleOn}55` : `inset 0 0 0 1px ${ut.panelBorder}, inset 0 1px 2px rgba(0,0,0,0.06)`,
            transition: "background 0.22s cubic-bezier(0.4,0,0.2,1), box-shadow 0.22s",
        }}>
            <div style={{
                position: "absolute", top: PAD, left: on ? W - K - PAD : PAD, width: K, height: K, borderRadius: K / 2,
                background: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.04)",
                transition: "left 0.28s cubic-bezier(0.34,1.4,0.64,1)",
            }} />
        </div>
    );
}

// ── ThemeSwatch - a miniature of the diagram, drawn in that theme ────────────
// 3 coloured dots said nothing about what the theme does. This draws the real
// thing in miniature: participant chips, lifelines and a message pill on the
// theme's own background, so the choice is previewed rather than labelled.
const THEME_SWATCHES = [
    { key: "light",   label: "Light",   bg: "#ffffff", cols: ["#ef4444", "#3b82f6", "#22c55e"], line: "#94a3b8", pill: "#ffffff", pillStroke: "#cbd5e1" },
    { key: "dark",    label: "Dark",    bg: "#16161e", cols: ["#a78bfa", "#60a5fa", "#34d399"], line: "#414868", pill: "#16161e", pillStroke: "#414868" },
    { key: "monokai", label: "Monokai", bg: "#272822", cols: ["#f92672", "#a6e22e", "#e6db74"], line: "#75715e", pill: "#272822", pillStroke: "#75715e" },
] as const;

function ThemeSwatch({ t }: { t: typeof THEME_SWATCHES[number] }) {
    const xs = [13, 36, 59];
    return (
        <svg viewBox="0 0 72 42" style={{ width: "100%", height: 40, display: "block" }} aria-hidden>
            <rect width="72" height="42" fill={t.bg} />
            {xs.map((x, i) => (
                <g key={x}>
                    <line x1={x} y1={13} x2={x} y2={37} stroke={t.cols[i]} strokeWidth={0.7} opacity={0.4} />
                    <rect x={x - 9} y={5} width={18} height={7} rx={2} fill={t.cols[i]} />
                </g>
            ))}
            <line x1={xs[0]} y1={21} x2={xs[1]} y2={21} stroke={t.cols[0]} strokeWidth={0.9} />
            <polygon points={`${xs[1]},21 ${xs[1] - 3},19.6 ${xs[1] - 3},22.4`} fill={t.cols[0]} />
            <rect x={xs[0] + 4} y={18} width={16} height={6} rx={3} fill={t.pill} stroke={t.pillStroke} strokeWidth={0.6} />
            <line x1={xs[1]} y1={31} x2={xs[2]} y2={31} stroke={t.cols[1]} strokeWidth={0.9} strokeDasharray="2 1.6" />
            <polygon points={`${xs[2]},31 ${xs[2] - 3},29.6 ${xs[2] - 3},32.4`} fill={t.cols[1]} />
        </svg>
    );
}

export function SettingsContent({
    opts, layout, copied, copiedLink, copiedSvg, copiedShare, mobile = false, participants = [], isSequence = true,
    upd, updL, exportPng, exportSvg, copySvg, exportCode, exportJson, copyCode, copyLink, share, viewUrl, tab, setTab, selectedPid, onAutoIcons,
}: {
    opts: Opts; layout: Layout; copied: boolean; copiedLink: boolean; copiedSvg: boolean; copiedShare: boolean;
    mobile?: boolean; participants?: Participant[]; isSequence?: boolean; viewUrl: string | null;
    upd: (p: Partial<Opts>) => void;
    updL: (p: Partial<Layout>) => void;
    exportPng: () => void; exportSvg: () => void; copySvg: () => void; exportCode: () => void; exportJson: () => void;
    copyCode: () => void; copyLink: () => void; share: () => void;
    onAutoIcons?: () => void;
    tab: "general" | "components" | "share"; setTab: (t: "general" | "components" | "share") => void;
    selectedPid?: string | null;
}) {
    // Same unique icon per participant that the renderer draws, label overrides included
    const iconKeys = assignIconKeys(participants.map(p => ({ id: p.id, label: opts.labelOverrides?.[p.id] ?? p.label })), opts.icons);
    const fs = (base: number) => mobile ? Math.round(base * 1.2) : base;
    const ut = UI_THEMES[opts.theme] ?? UI_THEMES.light;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <style>{`
                .sq-theme { position: relative; padding: 0; border-radius: 10px; background: transparent; cursor: pointer; border: none; overflow: visible; -webkit-tap-highlight-color: transparent; }
                .sq-theme .sq-theme-frame { border-radius: 9px; overflow: hidden; transition: transform 0.18s cubic-bezier(0.34,1.3,0.64,1), box-shadow 0.18s; }
                .sq-theme:hover .sq-theme-frame { transform: translateY(-1.5px); }
                .sq-theme:focus-visible { outline: none; }
                .sq-theme:focus-visible .sq-theme-frame { box-shadow: 0 0 0 2px ${ut.accent}66; }
                .sq-row { display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; border-radius: 7px; padding: 3px 6px; margin: 0 -6px; transition: background 0.14s; }
                .sq-row:hover { background: ${ut.tabBarBg}; }
                .sq-row:focus-visible { outline: none; box-shadow: 0 0 0 2px ${ut.accent}55; }
                .sq-row:active .sq-knob { width: 20px; }
            `}</style>

            {/* Tabs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, background: ut.tabBarBg, borderRadius: 8, padding: 2 }}>
                {(["general", "components", "share"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: "5px 4px", borderRadius: 6, fontSize: fs(10), fontWeight: 700,
                        textTransform: "capitalize", letterSpacing: "0.02em",
                        background: tab === t ? ut.activeTab : "transparent",
                        color: tab === t ? ut.activeTabText : ut.inactiveTabText,
                        border: "none", cursor: "pointer", transition: "all 0.15s",
                    }}>{t}</button>
                ))}
            </div>

            {tab === "general" && <>
                {/* Theme */}
                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Theme</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
                        {THEME_SWATCHES.map(t => {
                            const active = opts.theme === t.key;
                            return (
                                <button key={t.key} className="sq-theme" onClick={() => upd({ theme: t.key })}
                                    aria-label={`${t.label} theme`} aria-pressed={active} title={t.label}>
                                    <div className="sq-theme-frame" style={{
                                        boxShadow: active
                                            ? `0 0 0 2px ${ut.accent}, 0 3px 10px ${ut.accent}33`
                                            : `0 0 0 1px ${ut.panelBorder}`,
                                    }}>
                                        <ThemeSwatch t={t} />
                                    </div>
                                    {active && (
                                        <div style={{
                                            position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: "50%",
                                            background: ut.accent, display: "flex", alignItems: "center", justifyContent: "center",
                                            boxShadow: `0 1px 4px ${ut.accent}66`,
                                        }}>
                                            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                        </div>
                                    )}
                                    <span style={{ display: "block", marginTop: 5, fontSize: fs(9), fontWeight: 700, letterSpacing: "0.01em", color: active ? ut.accent : ut.inactiveTabText, transition: "color 0.15s" }}>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isSequence && <>
                    <div style={{ height: 1, background: ut.divider }} />

                    {/* Style toggles */}
                    <div>
                        <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 7 }}>Style</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: mobile ? 10 : 7 }}>
                            {([ ["coloredLines","Line Colors"], ["coloredNumbers","Numbers"], ["coloredText","Text Pill"], ["showNotes","Notes"] ] as const).map(([k, label]) => (
                                <div key={k} className="sq-row"
                                    role="button" tabIndex={0} aria-label={`Toggle ${label}`} aria-pressed={!!opts[k]}
                                    onClick={() => upd({ [k]: !opts[k] } as Partial<Opts>)}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); upd({ [k]: !opts[k] } as Partial<Opts>); } }}>
                                    <span style={{ fontSize: fs(11), color: opts[k] ? ut.bodyText : ut.inactiveTabText, fontWeight: 500, transition: "color 0.15s" }}>{label}</span>
                                    <Switch on={!!opts[k]} ut={ut} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ height: 1, background: ut.divider }} />

                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                            <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Layout</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                                role="button" tabIndex={0} aria-label="Toggle auto layout" aria-pressed={!!opts.autoLayout}
                                onClick={() => upd({ autoLayout: !opts.autoLayout })}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); upd({ autoLayout: !opts.autoLayout }); } }}>
                                <span style={{ fontSize: fs(10), fontWeight: 700, letterSpacing: "0.02em", color: opts.autoLayout ? ut.toggleOn : ut.sectionLabel, transition: "color 0.15s" }}>Auto</span>
                                <Switch on={!!opts.autoLayout} ut={ut} size="sm" />
                            </div>
                        </div>
                        {!opts.autoLayout && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <SliderRow label="Height" value={layout.stepHeight} min={30} max={80} fontSize={fs(12)} ut={ut} onChange={v => updL({ stepHeight: v })} />
                            <SliderRow label="Width" value={layout.boxWidth} min={80} max={400} fontSize={fs(12)} ut={ut} onChange={v => updL({ boxWidth: v })} />
                            <SliderRow label="Gap" value={layout.spacing} min={120} max={800} fontSize={fs(12)} ut={ut} onChange={v => updL({ spacing: v })} />
                            <SliderRow label="V.Gap" value={layout.vPad ?? 0} min={0} max={300} fontSize={fs(12)} ut={ut} onChange={v => updL({ vPad: v })} />
                            <SliderRow label="Font" value={layout.textSize} min={8} max={20} unit="px" fontSize={fs(12)} ut={ut} onChange={v => updL({ textSize: v })} />
                            <SliderRow label="Margin" value={layout.margin} min={120} max={200} fontSize={fs(12)} ut={ut} onChange={v => updL({ margin: v })} />
                        </div>}
                    </div>
                </>}

            </>}

            {tab === "share" && <>
                {/* QR code → click to copy prod link */}
                {viewUrl && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <div
                        role="button" tabIndex={0} aria-label="Copy view link"
                        onClick={() => { navigator.clipboard.writeText(viewUrl).catch(() => {}); showToast("Link copied!", { color: "#7c3aed" }); }}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigator.clipboard.writeText(viewUrl).catch(() => {}); showToast("Link copied!", { color: "#7c3aed" }); } }}
                        style={{ background: "#ffffff", borderRadius: 12, padding: 10, display: "inline-flex", cursor: "pointer" }}
                        title="Click to copy link"
                    >
                        {viewUrl.length > 2000
                            ? <div style={{ width: 160, height: 160, borderRadius: 8, background: "repeating-linear-gradient(45deg,#e2e8f0 0,#e2e8f0 4px,#f8fafc 4px,#f8fafc 12px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: "0 12px", lineHeight: 1.4 }}>Sequence too large for QR</span>
                              </div>
                            : <QRCodeSVG value={viewUrl} size={160} bgColor="#ffffff" fgColor="#1e293b" level="M" />
                        }
                    </div>
                    <p style={{ fontSize: fs(10), color: ut.sectionLabel, textAlign: "center", margin: 0, lineHeight: 1.5 }}>
                        Click to copy · scan to download SVG
                    </p>
                </div>}

                <div style={{ height: 1, background: ut.divider }} />

                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Download</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        {/* Row 1 */}
                        <button onClick={exportPng}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#FF6188", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            PNG
                        </button>
                        <button onClick={exportSvg}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#FC9867", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            SVG
                        </button>
                        {/* Row 2 */}
                        <button onClick={copyLink}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copiedLink ? "#A9DC76" : "#A9DC76", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copiedLink ? "Copied!" : "Link"}
                        </button>
                        <button onClick={copySvg} title="Copy the diagram as SVG, fitted to the whole diagram"
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copiedSvg ? "#A9DC76" : "#FFD866", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copiedSvg ? "Copied!" : "Copy"}
                        </button>
                        {/* Row 3 */}
                        <button onClick={share}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: copiedShare ? "#A9DC76" : "#78DCE8", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            {copiedShare ? "Shared!" : "Share"}
                        </button>
                        <button onClick={exportCode}
                            className="rounded-xl font-semibold transition-all hover:brightness-110 active:scale-95"
                            style={{ background: "#AB9DF2", color: "#221F22", cursor: "pointer", padding: mobile ? "9px 0" : "7px 0", fontSize: fs(11) }}>
                            Code
                        </button>
                    </div>
                </div>
            </>}

            {tab === "components" && isSequence && <>
                {/* Box Overlay */}
                <div>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Overlay</div>
                    {/* Graphite, not blue. The overlay is a texture drawn over a
                        participant box in whatever colour that participant has,
                        so a coloured swatch says nothing about the choice and 5
                        of them in a row read as one blue wall. On a neutral chip
                        the texture itself is the difference, and the accent is
                        left to mean exactly one thing: what is selected. */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                        {([
                            ["none",  "None",  ""],
                            ["gloss", "Gloss", "linear-gradient(to bottom, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.34) 55%, transparent 55%)"],
                            ["hatch", "Hatch", "repeating-linear-gradient(45deg, rgba(255,255,255,0.32) 0px, rgba(255,255,255,0.32) 1px, transparent 1px, transparent 9px)"],
                            ["dots",  "Dots",  ""],
                            ["pulse", "Pulse", "radial-gradient(circle at 50% 50%, transparent 18%, rgba(255,255,255,0.3) 19%, rgba(255,255,255,0.3) 21%, transparent 22%, transparent 36%, rgba(255,255,255,0.3) 37%, rgba(255,255,255,0.3) 39%, transparent 40%)"],
                        ] as const).map(([v, label, overlay]) => {
                            const active = opts.boxOverlay === v;
                            return (
                                <button key={v} className="sq-theme" onClick={() => upd({ boxOverlay: v })}
                                    aria-label={`${label} overlay`} aria-pressed={active} title={label}>
                                    <div className="sq-theme-frame" style={{
                                        height: 34, borderRadius: 8, position: "relative", overflow: "hidden",
                                        background: "linear-gradient(160deg, #5b6675 0%, #3f4855 100%)",
                                        boxShadow: active ? `0 0 0 2px ${ut.accent}, 0 3px 10px ${ut.accent}33` : `0 0 0 1px ${ut.panelBorder}`,
                                    }}>
                                        {v === "dots"
                                            ? <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.4) 1.5px, transparent 1.5px)", backgroundSize: "7px 7px" }} />
                                            : overlay && <div style={{ position: "absolute", inset: 0, background: overlay }} />}
                                    </div>
                                    <span style={{ display: "block", marginTop: 5, fontSize: fs(9), fontWeight: 700, color: active ? ut.accent : ut.inactiveTabText, letterSpacing: "0.02em", transition: "color 0.15s" }}>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Icon mode 3-way selector */}
                <div style={{ height: 1, background: ut.divider }} />
                {/* One segmented control, same shape as the tab bar above it -
                    a raised white pill on a recessed track. It used to fill
                    green, which made a 3rd accent colour in a panel that should
                    only ever speak in 1. */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Icon style</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, background: ut.tabBarBg, borderRadius: 8, padding: 2 }}>
                        {(["none", "icons", "emoji"] as const).map(mode => {
                            const on = opts.iconMode === mode;
                            return (
                                <button key={mode} onClick={() => upd({ iconMode: mode })} aria-pressed={on} style={{
                                    padding: "5px 0", fontSize: fs(10), fontWeight: 700, borderRadius: 6, border: "none", cursor: "pointer",
                                    background: on ? ut.activeTab : "transparent",
                                    color: on ? ut.activeTabText : ut.inactiveTabText,
                                    boxShadow: on ? "0 1px 3px rgba(0,0,0,0.14)" : "none",
                                    textTransform: "capitalize", transition: "all 0.15s",
                                }}>{mode}</button>
                            );
                        })}
                    </div>
                </div>

                {/* Icons editor — only when iconMode is "icons" */}
                {opts.iconMode === "icons" && participants.length > 0 && <>
                    <div style={{ height: 1, background: ut.divider }} />
                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Icons</span>
                            {onAutoIcons && <button onClick={onAutoIcons} style={{
                                fontSize: fs(9), fontWeight: 700, letterSpacing: "0.03em", color: ut.accent,
                                background: "transparent", border: `1px solid ${ut.accent}40`, borderRadius: 999, padding: "2px 10px",
                                cursor: "pointer", transition: "all 0.15s",
                            }}>Auto</button>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {participants.map(p => {
                                const currentKey = iconKeys[p.id];
                                const isSelected = selectedPid === p.id;
                                const effectiveColor = opts.colorOverrides?.[p.id] ?? p.color;
                                const hasOverride = !!opts.colorOverrides?.[p.id];
                                return (
                                    <div key={p.id} data-icon-row={p.id} style={{
                                        display: "flex", alignItems: "stretch", borderRadius: 8,
                                        border: isSelected ? "2px solid #3b82f6" : "2px solid #111",
                                        boxShadow: isSelected ? "0 0 0 2px rgba(59,130,246,0.35)" : "none",
                                        overflow: "hidden", height: 36, transition: "box-shadow 0.15s, border-color 0.15s",
                                    }}>
                                        {/* White icon section — click to change icon */}
                                        <IconPicker value={currentKey} color={effectiveColor} ut={ut} onChange={k => upd({ icons: { ...opts.icons, [p.id]: k } })} />
                                        {/* Colored label section with overlay */}
                                        <div style={{ flex: 1, background: effectiveColor, display: "flex", alignItems: "center", paddingLeft: 10, borderLeft: "1px solid rgba(255,255,255,0.25)", position: "relative", overflow: "hidden" }}>
                                            {opts.boxOverlay === "gloss" && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.18) 55%, transparent 55%)", pointerEvents: "none" }} />}
                                            {opts.boxOverlay === "hatch" && <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 1px, transparent 1px, transparent 9px)", pointerEvents: "none" }} />}
                                            {opts.boxOverlay === "dots" && <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.22) 1.2px, transparent 1.2px)", backgroundSize: "7px 7px", pointerEvents: "none" }} />}
                                            {opts.boxOverlay === "pulse" && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, transparent 20%, rgba(255,255,255,0.08) 21%, rgba(255,255,255,0.08) 22%, transparent 23%, transparent 38%, rgba(255,255,255,0.08) 39%, rgba(255,255,255,0.08) 40%, transparent 41%)", pointerEvents: "none" }} />}
                                            <input
                                                defaultValue={opts.labelOverrides?.[p.id] ?? p.label}
                                                key={opts.labelOverrides?.[p.id] ?? p.label}
                                                onBlur={e => {
                                                    const v = e.currentTarget.value.trim();
                                                    if (v && v !== p.label) upd({ labelOverrides: { ...opts.labelOverrides, [p.id]: v } });
                                                    else if (!v || v === p.label) {
                                                        const next = { ...opts.labelOverrides }; delete next[p.id]; upd({ labelOverrides: next });
                                                    }
                                                }}
                                                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                                style={{ fontSize: fs(12), fontWeight: 700, color: "#000", flex: 1, minWidth: 0, background: "transparent", border: "none", fontFamily: "inherit", padding: 0 }}
                                            />
                                            {/* Color picker swatch — click to change color */}
                                            <label title={hasOverride ? "Reset to default color (right-click)" : "Pick color"} style={{
                                                position: "relative", width: 22, height: 22, borderRadius: 4,
                                                border: "1.5px solid rgba(255,255,255,0.7)", background: effectiveColor,
                                                cursor: "pointer", marginRight: 6, flexShrink: 0,
                                                boxShadow: hasOverride ? "0 0 0 1px #fff inset" : "none",
                                            }}
                                                onContextMenu={e => {
                                                    e.preventDefault();
                                                    if (!hasOverride) return;
                                                    const next = { ...opts.colorOverrides }; delete next[p.id]; upd({ colorOverrides: next });
                                                }}>
                                                <input type="color" value={effectiveColor}
                                                    onChange={e => upd({ colorOverrides: { ...opts.colorOverrides, [p.id]: e.currentTarget.value } })}
                                                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", border: "none", padding: 0 }}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>}
            </>}

        </div>
    );
}

// ── IconSvg — renders an icon key as React SVG ────────────────────────────────
function IconSvg({ iconKey, size = 16, color = "currentColor" }: { iconKey: string; size?: number; color?: string }) {
    const nodes = ICON_NODES[iconKey] ?? ICON_NODES.package;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", flexShrink: 0 }}>
            {nodes.map(([tag, props], i) => {
                const p = props as Record<string, string | number>;
                if (tag === "path")     return <path key={i} {...p} />;
                if (tag === "rect")     return <rect key={i} {...p} />;
                if (tag === "circle")   return <circle key={i} {...p} />;
                if (tag === "ellipse")  return <ellipse key={i} {...p} />;
                if (tag === "polygon")  return <polygon key={i} {...p} />;
                if (tag === "polyline") return <polyline key={i} {...p} />;
                return null;
            })}
        </svg>
    );
}

// ── IconPicker ─────────────────────────────────────────────────────────────────
function IconPicker({ value, color, ut, onChange }: { value: string; color: string; ut: UiTheme; onChange: (k: string) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const ref = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleOpen = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 6, left: r.left });
        }
        setOpen(o => !o);
        setSearch("");
    };

    const filtered = ICON_KEYS.filter(k => !search || k.includes(search.toLowerCase()));

    return (
        <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
            <button
                ref={btnRef}
                onClick={handleOpen}
                title={value}
                aria-label={`Change icon (current: ${value})`}
                style={{ width: 36, height: "100%", borderRadius: 0, background: "#ffffff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
                <IconSvg iconKey={value} size={18} color={color} />
            </button>
            {open && (
                <div style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 9999, background: ut.panelBg, border: `1px solid ${ut.panelBorder}`, borderRadius: 10, padding: 8, width: 232, boxShadow: "0 8px 32px rgba(0,0,0,0.7)" }}>
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search… (u = user, db, bot…)"
                        style={{ width: "100%", background: ut.activeTab, border: `1px solid ${ut.divider}`, borderRadius: 6, color: ut.bodyText, fontSize: 11, padding: "5px 8px", marginBottom: 8, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, maxHeight: 210, overflowY: "auto" }}>
                        {filtered.map(k => (
                            <button
                                key={k}
                                onClick={() => { onChange(k); setOpen(false); }}
                                title={k}
                                style={{
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    gap: 4, padding: "7px 4px", borderRadius: 7, cursor: "pointer",
                                    background: k === value ? color + "33" : "transparent",
                                    border: k === value ? `1px solid ${color}88` : "1px solid transparent",
                                    color: ut.bodyText,
                                }}
                            >
                                <IconSvg iconKey={k} size={18} color={k === value ? color : ut.zoomMuted} />
                                <span style={{ fontSize: 8, color: ut.sectionLabel, textAlign: "center", lineHeight: 1.2, overflow: "hidden", width: "100%", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && <span style={{ gridColumn: "1/-1", color: ut.inactiveTabText, fontSize: 11, textAlign: "center", padding: 12 }}>No icons found</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
