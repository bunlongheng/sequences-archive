import { NextRequest, NextResponse } from "next/server";
import { authorizeOwner } from "@/lib/auth-owner";
import db from "@/lib/db";

// Lightweight owner check the client shell/editor use to decide full-access vs
// presenter mode. Reflects the real server gate (local bypass / Bearer / session).
//
// Also returns the owner's profile. The client shell used to read the Google
// photo from getSession(), which does not always carry `image`, and otherwise
// fell back to a localStorage cache - so a browser that had never cached it
// showed the initial instead of the avatar. The server already resolves the
// photo from the users table for the server-rendered index; returning it here
// gives the client path the same source instead of a per-browser cache.
export async function GET(req: NextRequest) {
  const authorized = await authorizeOwner(req);
  if (!authorized) return NextResponse.json({ authorized: false });

  const email = (process.env.OWNER_EMAIL ?? process.env.ALLOWED_EMAIL)?.trim().toLowerCase();
  if (!email) return NextResponse.json({ authorized: true });

  try {
    const { rows } = await db.query(
      "SELECT name, email, image FROM users WHERE lower(email) = $1 LIMIT 1",
      [email]
    );
    const u = rows[0];
    return NextResponse.json({
      authorized: true,
      profile: u ? { name: u.name ?? null, email: u.email ?? null, image: u.image ?? null } : null,
    });
  } catch (err: unknown) {
    // Never fail the authorization answer over a profile lookup.
    console.error("[sequences] /api/auth/me profile lookup failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ authorized: true });
  }
}
