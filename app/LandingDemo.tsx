"use client";
import SocialFooter from "./SocialFooter";
import Wordmark from "./Wordmark";

type Demo = { id: string; title: string; sequence_type: string };

// Public landing shown to logged-out visitors: a curated gallery of the best
// public sequences as a live demo, on the app's on-brand animated backdrop, with
// a single Sign in call to action. No login is forced — strangers browse freely;
// only creating your own needs an account (/login).
export default function LandingDemo({ sequences }: { sequences: Demo[] }) {
  const demos = sequences.slice(0, 8);

  return (
    <div style={{
      position: "fixed", inset: 0, overflowY: "auto",
      background: "radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #f5f6fb 55%, #eceef5 100%)",
      fontFamily: "system-ui,-apple-system,sans-serif",
    }}>
      {/* On-brand animated backdrop: sequence lifelines with message arrows. */}
      <svg aria-hidden="true" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.8 }}>
        <defs>
          <radialGradient id="ldR"><stop offset="0%" stopColor="#ef4444" stopOpacity="0.14" /><stop offset="70%" stopColor="#ef4444" stopOpacity="0" /></radialGradient>
          <radialGradient id="ldY"><stop offset="0%" stopColor="#eab308" stopOpacity="0.14" /><stop offset="70%" stopColor="#eab308" stopOpacity="0" /></radialGradient>
          <radialGradient id="ldGr"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.14" /><stop offset="70%" stopColor="#22c55e" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse className="ld-blob" cx="360" cy="300" rx="320" ry="290" fill="url(#ldR)" />
        <ellipse className="ld-blob" cx="620" cy="480" rx="340" ry="300" fill="url(#ldY)" style={{ animationDelay: "-8s" }} />
        <ellipse className="ld-blob" cx="860" cy="320" rx="320" ry="290" fill="url(#ldGr)" style={{ animationDelay: "-16s" }} />
        <line className="ld-life" x1="380" y1="0" x2="380" y2="800" stroke="#ef4444" strokeWidth="3" strokeDasharray="10 14" opacity="0.16" />
        <line className="ld-life" x1="600" y1="0" x2="600" y2="800" stroke="#eab308" strokeWidth="3" strokeDasharray="10 14" opacity="0.16" style={{ animationDuration: "44s" }} />
        <line className="ld-life" x1="820" y1="0" x2="820" y2="800" stroke="#22c55e" strokeWidth="3" strokeDasharray="10 14" opacity="0.16" style={{ animationDuration: "40s" }} />
      </svg>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1440, margin: "0 auto", padding: "0 24px 22px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {/* Header — showcase only, no sign-in (login is owner-only). */}
        <header style={{ height: 52, display: "flex", alignItems: "center" }}>
          <Wordmark size={32} priority />
        </header>

        {/* Hero */}
        <section className="ld-in" style={{ textAlign: "center", padding: "18px 0 16px" }}>
          <h1 style={{ fontSize: 34, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em", color: "#0f172a", margin: "0 0 8px" }}>
            <span className="ld-flip">
              <span>Beautiful</span>
              <span>Clean</span>
              <span>Elegant</span>
            </span>{" "}Sequence Diagrams
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "8px auto 0", maxWidth: 720, lineHeight: 1.45 }}>
            AI-friendly and AI-integrated - agents create these via MCP or plain English.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
            {[
              ["#8b5cf6", "AI-generated via MCP"],
              ["#14b8a6", "Natural language → live render"],
            ].map(([c, label]) => (
              <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151", background: "#fff", border: "1px solid #e6e8ee", borderRadius: 20, padding: "5px 11px", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{label}
              </span>
            ))}
          </div>
        </section>

        {/* Gallery */}
        {demos.length > 0 && (
          <section className="ld-grid ld-in" style={{ display: "grid", gap: 12, flex: 1, minHeight: 0 }}>
            {demos.map((d, i) => (
              <a key={d.id} href={`/d/${d.id}`} className="ld-card" style={{
                display: "flex", flexDirection: "column", background: "#fff",
                border: "1px solid #e6e8ee", overflow: "hidden",
                textDecoration: "none", boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
                animationDelay: `${0.05 * i}s`,
              }}>
                <div style={{ padding: "8px 13px 7px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f1f2f6", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                </div>
                <div style={{ aspectRatio: "2.05", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, overflow: "hidden" }}>
                  {/* Public SVG render — object-fit:contain shows the whole diagram
                      (nothing clipped), scaled to fit the card. */}
                  <img src={`/svg/${d.id}?title=0`} alt={d.title} loading="lazy"
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              </a>
            ))}
          </section>
        )}

        {/* marginTop:auto pins the footer to the bottom of the viewport */}
        <div style={{ marginTop: "auto" }}><SocialFooter /></div>
      </div>

      <style>{`
        @keyframes ldUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ldFlow { to { stroke-dashoffset: -240; } }
        @keyframes ldBlob { 0%,100% { transform: translate(0,0); } 50% { transform: translate(24px,-18px); } }
        .ld-in { opacity: 0; animation: ldUp 0.6s cubic-bezier(.16,.84,.44,1) both; }
        /* Fade-only entrance (no transform) so the hover translateY isn't blocked
           by the animation's filled transform value. */
        @keyframes ldFade { from { opacity: 0; } to { opacity: 1; } }
        .ld-card { opacity: 0; animation: ldFade 0.5s ease both; transition: box-shadow .18s, transform .18s, border-color .18s; }
        .ld-card img { transition: transform .22s cubic-bezier(.16,.84,.44,1); }
        /* inline box-shadow/border on the card need !important to be overridden */
        .ld-card:hover { transform: translateY(-4px); border-color: #c4c9d6 !important; box-shadow: 0 14px 34px rgba(15,23,42,0.14) !important; }
        .ld-card:hover img { transform: scale(1.045); }
        .ld-life { animation: ldFlow 48s linear infinite; }
        .ld-blob { animation: ldBlob 18s ease-in-out infinite; }
        /* Rotating word before "Sequences" — CSS-only, 6 words, ~2s each. */
        .ld-flip { display: inline-grid; justify-items: end; vertical-align: bottom; color: #7c3aed; }
        .ld-flip > span { grid-area: 1 / 1; opacity: 0; white-space: nowrap; animation: ldflip 6s infinite; }
        .ld-flip > span:nth-child(1) { animation-delay: 0s; }
        .ld-flip > span:nth-child(2) { animation-delay: 2s; }
        .ld-flip > span:nth-child(3) { animation-delay: 4s; }
        @keyframes ldflip {
          0%   { opacity: 0; transform: translateY(14px); }
          5%   { opacity: 1; transform: translateY(0); }
          28%  { opacity: 1; transform: translateY(0); }
          33%  { opacity: 0; transform: translateY(-14px); }
          100% { opacity: 0; transform: translateY(-14px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ld-flip > span { animation: none; opacity: 0; }
          .ld-flip > span:first-child { opacity: 1; }
        }

        /* Desktop: 8 cards (4 x 2). iPad: 6 (3 x 2). Phone: 4 (2 x 2). */
        /* 4 up. Rows are sized to the diagram, not stretched to fill the
           viewport: a compact sequence is ~2:1, so a stretched row makes a tall
           card that letterboxes most of the tile away. min-content rows plus a
           fixed aspect on the render box means the card IS the diagram's shape,
           and align-content centres the block in whatever height is left. */
        .ld-grid { grid-template-columns: repeat(4, 1fr); grid-auto-rows: min-content; align-content: center; }
        @media (max-width: 1024px) {
          .ld-grid { grid-template-columns: repeat(3, 1fr); }
          .ld-card:nth-child(n+7) { display: none !important; }
        }
        @media (max-width: 720px) {
          .ld-grid { grid-template-columns: repeat(2, 1fr); }
          .ld-card:nth-child(n+5) { display: none !important; }
          h1 { font-size: 30px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ld-in, .ld-card, .ld-life, .ld-blob { animation: none !important; opacity: 1 !important; }
        }
      `}</style>
    </div>
  );
}
