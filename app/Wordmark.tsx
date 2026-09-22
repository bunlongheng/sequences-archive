import Image from "next/image";

// The one lockup, used by the app header and the public landing. They drifted
// apart by size and weight (28px/700 against 32px/800), which read as 2
// different marks on 2 pages of the same product.
export default function Wordmark({ size = 32, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Image src="/icon-512.png" alt="Sequences" width={size} height={size} priority={priority}
        style={{ borderRadius: size * 0.25 }} />
      <span style={{ fontSize: Math.round(size * 0.53), fontWeight: 800, letterSpacing: "-0.01em", color: "#111827" }}>
        Sequences
      </span>
    </div>
  );
}
