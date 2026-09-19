"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const QRCodeSVG = dynamic(() => import("qrcode.react").then(m => ({ default: m.QRCodeSVG })), { ssr: false });
import { showToast } from "./CuteToast";
import { guessIconKey, ICON_NODES } from "@/lib/svg-renderer";
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
    const fs = (base: number) => mobile ? Math.round(base * 1.2) : base;
    const ut = UI_THEMES[opts.theme] ?? UI_THEMES.light;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

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
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                        {([
                            ["light",   "Light",   "#ffffff", "#1e293b", ["#e879f9","#38bdf8","#34d399"]],
                            ["dark",    "Dark",    "#0f1117", "#e2e8f0", ["#a78bfa","#60a5fa","#34d399"]],
                            ["monokai", "Monokai", "#272822", "#f8f8f2", ["#f92672","#a6e22e","#e6db74"]],
                        ] as const).map(([t, label, bg, fg, dots]) => {
                            const active = opts.theme === t;
                            return (
                                <button key={t} onClick={() => upd({ theme: t })} style={{
                                    padding: 0, borderRadius: 8, border: active ? "1.5px solid #3b82f6" : "1.5px solid transparent",
                                    background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, overflow: "hidden",
                                }}>
                                    {/* Swatch */}
                                    <div style={{ width: "100%", height: 32, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0, border: `1px solid ${active ? "#3b82f6" : ut.panelBorder}` }}>
                                        {dots.map((c, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />)}
                                    </div>
                                    <span style={{ fontSize: fs(9), fontWeight: 700, color: active ? ut.accent : ut.inactiveTabText, paddingBottom: 3 }}>{label}</span>
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
                                <div key={k} className="flex items-center justify-between cursor-pointer select-none"
                                    role="button" tabIndex={0} aria-label={`Toggle ${label}`} aria-pressed={!!opts[k]}
                                    onClick={() => upd({ [k]: !opts[k] } as Partial<Opts>)}
                                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); upd({ [k]: !opts[k] } as Partial<Opts>); } }}>
                                    <span style={{ fontSize: fs(11), color: ut.bodyText, fontWeight: 400 }}>{label}</span>
                                    <div style={{ position: "relative", width: 34, height: 20, borderRadius: 10, flexShrink: 0, background: opts[k] ? ut.toggleOn : ut.tabBarBg, transition: "background 0.2s", cursor: "pointer" }}>
                                        <div style={{ position: "absolute", top: 2, width: 16, height: 16, borderRadius: 8, background: "white", left: opts[k] ? 16 : 2, transition: "left 0.2s ease", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
                                    </div>
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
                                <span style={{ fontSize: fs(10), fontWeight: 600, color: opts.autoLayout ? ut.toggleOn : ut.sectionLabel, transition: "color 0.15s" }}>Auto</span>
                                <div style={{ position: "relative", width: 32, height: 18, borderRadius: 9, background: opts.autoLayout ? ut.toggleOn : ut.panelBorder, transition: "background 0.2s" }}>
                                    <div style={{ position: "absolute", top: 2, left: opts.autoLayout ? 16 : 2, width: 14, height: 14, borderRadius: 7, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                                </div>
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
                        {([
                            ["none",  "None",  ""],
                            ["gloss", "Gloss", "linear-gradient(to bottom, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.32) 55%, transparent 55%)"],
                            ["hatch", "Hatch", "repeating-linear-gradient(45deg, rgba(255,255,255,0.3) 0px, rgba(255,255,255,0.3) 1px, transparent 1px, transparent 9px)"],
                            ["dots",  "Dots",  ""],
                            ["pulse", "Pulse", "radial-gradient(circle at 50% 50%, transparent 18%, rgba(255,255,255,0.28) 19%, rgba(255,255,255,0.28) 21%, transparent 22%, transparent 36%, rgba(255,255,255,0.28) 37%, rgba(255,255,255,0.28) 39%, transparent 40%)"],
                        ] as const).map(([v, label, overlay]) => {
                            const active = opts.boxOverlay === v;
                            return (
                                <button key={v} onClick={() => upd({ boxOverlay: v })} style={{
                                    padding: 0, borderRadius: 8, border: active ? "1.5px solid #3b82f6" : "1.5px solid transparent",
                                    background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, overflow: "hidden",
                                }}>
                                    {/* Swatch */}
                                    <div style={{ width: "100%", height: 32, borderRadius: 6, background: "#4f8ef7", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                                        {v === "dots"
                                            ? <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.35) 1.5px, transparent 1.5px)", backgroundSize: "7px 7px" }} />
                                            : overlay && <div style={{ position: "absolute", inset: 0, background: overlay }} />
                                        }
                                    </div>
                                    {/* Label */}
                                    <span style={{ fontSize: fs(9), fontWeight: 700, color: active ? ut.accent : ut.inactiveTabText, letterSpacing: "0.02em", paddingBottom: 3 }}>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Icon mode 3-way selector */}
                <div style={{ height: 1, background: ut.divider }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: fs(11), color: ut.bodyText, fontWeight: 400 }}>Icons</span>
                    <div style={{ display: "flex", gap: 4 }}>
                        {(["none", "icons", "emoji"] as const).map(mode => (
                            <button key={mode} onClick={() => upd({ iconMode: mode })} style={{
                                flex: 1, padding: "3px 0", fontSize: fs(10), fontWeight: 600,
                                borderRadius: 6, border: "none", cursor: "pointer",
                                background: opts.iconMode === mode ? ut.toggleOn : ut.tabBarBg,
                                color: opts.iconMode === mode ? "#fff" : ut.bodyText,
                                textTransform: "capitalize", transition: "background 0.15s",
                            }}>{mode}</button>
                        ))}
                    </div>
                </div>

                {/* Icons editor — only when iconMode is "icons" */}
                {opts.iconMode === "icons" && participants.length > 0 && <>
                    <div style={{ height: 1, background: ut.divider }} />
                    <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: fs(9), fontWeight: 700, color: ut.sectionLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Icons</span>
                            {onAutoIcons && <button onClick={onAutoIcons} style={{
                                fontSize: fs(9), fontWeight: 600, color: "#3b82f6", background: "rgba(59,130,246,0.1)",
                                border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, padding: "2px 8px",
                                cursor: "pointer", transition: "all 0.15s",
                            }}>Auto</button>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {participants.map(p => {
                                const currentKey = ICON_NODES[opts.icons[p.id]] ? opts.icons[p.id] : guessIconKey(p.label);
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
