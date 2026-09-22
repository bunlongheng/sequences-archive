import db from "@/lib/db";
import LandingDemo from "../LandingDemo";
import { DEMO_IDS } from "@/lib/demo-ids";

// Public /demo gallery: a hand-picked, hard-coded set of polished demo sequences
// (each 5+ participants, modern topics). Pinned by id so the gallery NEVER shows
// the owner's own working sequences or low-quality ones — only this curated set,
// in this order. To change the lineup, edit DEMO_IDS.
export const revalidate = 300;

type Demo = { id: string; title: string; sequence_type: string };

// Lineup lives in lib/demo-ids so the owner's Demo tab shows the same set.

export default async function DemoPage() {
  const { rows } = await db.query(
    `SELECT id, title, sequence_type FROM sequences WHERE id = ANY($1::uuid[])`,
    [[...DEMO_IDS]]
  );
  const byId = new Map(rows.map(r => [r.id, r]));
  // Preserve the curated order (SQL doesn't guarantee it).
  const sequences = DEMO_IDS.map(id => byId.get(id)).filter(Boolean);
  return <LandingDemo sequences={JSON.parse(JSON.stringify(sequences)) as Demo[]} />;
}
