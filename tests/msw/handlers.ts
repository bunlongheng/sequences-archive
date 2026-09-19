import { http, HttpResponse } from "msw";

// Default handlers are intentionally minimal - individual tests register the
// outbound-HTTP stubs they need with `server.use(...)`. Anything not handled is
// bypassed (see tests/setup.ts onUnhandledRequest: "bypass").
export const handlers = [
  // Harmless defaults the SequencesShell component test relies on: the saved
  // sequences list, and the owner/profile endpoint the shell reads the Google
  // avatar from. Tests override these with server.use() as needed.
  http.get("*/api/sequences", () => HttpResponse.json([])),
  http.get("*/api/auth/me", () => HttpResponse.json({ authorized: true, profile: null })),
];
