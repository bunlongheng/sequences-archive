"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getSession } from "next-auth/react";
import SequencesClient, { type ShellUser } from "./SequencesClient";
import LoginLanding from "./LoginLanding";

type Sequence = {
  id: string; title: string; slug: string;
  sequence_type: string; created_at: string; updated_at: string; code: string; tags: string[];
};

export default function SequencesShell({ initial }: { initial?: { user: ShellUser | null; sequences: Sequence[] } }) {
  const [user, setUser] = useState<ShellUser | null>(initial?.user ?? null);
  const [sequences, setSequences] = useState<Sequence[]>(initial?.sequences ?? []);
  // When the server already resolved auth + sequences (direct index load) we are
  // ready on first paint - no client waterfall. The client fetch only runs when
  // no server data was provided (e.g. returning here from the editor route).
  const [ready, setReady] = useState(!!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;

    (async () => {
      try {
        // The /api/sequences gate is the source of truth for authorization:
        // 200 on a real owner session OR a local/LAN request (Stickies-style
        // bypass); 401 otherwise. Avoids relying on getSession() alone, which
        // is null on localhost where there is no real session.
        // Both awaits are independent, so run them concurrently.
        const [res, session, me] = await Promise.all([
          fetch("/api/sequences"),
          getSession().catch(() => null),
          // getSession() does not reliably carry the Google photo on this path,
          // so ask the server, which reads it from the users table.
          fetch("/api/auth/me").then((r) => r.json()).catch(() => null),
        ]);
        if (!res.ok) { if (!cancelled) { setUser(null); setReady(true); } return; }

        const data = await res.json();
        if (cancelled) return;

        if (Array.isArray(data)) setSequences(data);
        setUser({
          email: session?.user?.email ?? me?.profile?.email ?? "owner",
          user_metadata: {
            full_name: session?.user?.name ?? me?.profile?.name ?? undefined,
            avatar_url: session?.user?.image ?? me?.profile?.image ?? undefined,
          },
        });
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Show loading until auth is checked AND sequences are fetched
  if (!ready) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#f4f5f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, border: "3px solid #e5e7eb", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "system-ui" }}>Loading sequences…</span>
        </div>
      </div>
    );
  }

  if (!user) return <LoginLanding />;

  return <SequencesClient user={user} sequences={sequences} />;
}
