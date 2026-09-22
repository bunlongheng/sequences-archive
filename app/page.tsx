import db from "@/lib/db";
import { auth } from "@/auth";
import { resolveOwnerIdServer } from "@/lib/auth-owner";
import SequencesShell from "./SequencesShell";
import SequenceEditor from "./SequenceEditor";
import LoginLanding from "./LoginLanding";
import type { ShellUser } from "./SequencesClient";

// The "/" route. ?id= / ?new / ?data open the client editor; everything else is
// the index, which is server-rendered: auth + the owner's sequences are resolved
// on the server and handed to the shell as initial data (no client waterfall,
// content in the initial HTML).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  if ("id" in sp || "new" in sp || "data" in sp) return <SequenceEditor />;

  const uid = await resolveOwnerIdServer();

  // Logged-out visitor: the landing / login splash. The public demo lives at /demo.
  if (!uid) return <LoginLanding />;

  // Owner: every diagram (public + private), full editor.
  const [session, result] = await Promise.all([
    auth(),
    db.query(
      "SELECT id, title, slug, sequence_type, created_at, updated_at, code, tags, settings, settings->>'youtubeId' AS youtube_id FROM sequences WHERE user_id = $1 ORDER BY updated_at DESC",
      [uid]
    ),
  ]);
  // Match NextResponse.json: Date columns serialize to ISO strings for the client.
  const sequences: Sequence[] = JSON.parse(JSON.stringify(result.rows));
  // The local dev bypass has no session, so fall back to the owner row the
  // NextAuth adapter already stores (name + Google profile photo).
  let profile = {
    email: session?.user?.email ?? undefined,
    name: session?.user?.name ?? undefined,
    image: session?.user?.image ?? undefined,
  };
  if (!profile.image) {
    const ownerEmail = (process.env.OWNER_EMAIL ?? process.env.ALLOWED_EMAIL)?.trim().toLowerCase();
    if (ownerEmail) {
      const { rows } = await db.query(
        "SELECT name, email, image FROM users WHERE lower(email) = $1 LIMIT 1",
        [ownerEmail]
      );
      if (rows[0]) profile = { email: profile.email ?? rows[0].email, name: profile.name ?? rows[0].name, image: rows[0].image ?? undefined };
    }
  }
  const user: ShellUser = {
    email: profile.email ?? "owner",
    user_metadata: {
      full_name: profile.name ?? undefined,
      avatar_url: profile.image ?? undefined,
    },
  };

  return <SequencesShell initial={{ user, sequences }} />;
}

type Sequence = {
  id: string; title: string; slug: string;
  sequence_type: string; created_at: string; updated_at: string; code: string; tags: string[];
};
