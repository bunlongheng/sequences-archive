/**
 * Provenance capture for programmatic requests: what gets recorded, and that a
 * failed log write never propagates to the caller.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ default: { query: vi.fn() } }));

import db from "@/lib/db";
import { requestOrigin, logApiRequest } from "@/lib/api-log";

const q = db.query as unknown as ReturnType<typeof vi.fn>;

function req(headers: Record<string, string>) {
  return new Request("http://localhost:3002/api/ai/sequences", { method: "POST", headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  q.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("requestOrigin", () => {
  it("takes the client IP from the first x-forwarded-for entry", () => {
    const o = requestOrigin(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }));
    expect(o.ip).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded chain", () => {
    expect(requestOrigin(req({ "x-real-ip": "198.51.100.5" })).ip).toBe("198.51.100.5");
  });

  it("captures geo, agent and referer headers", () => {
    const o = requestOrigin(req({
      "x-vercel-ip-country": "US", "x-vercel-ip-city": "Phoenix",
      "user-agent": "smoke/1.0", referer: "https://example.test/a", origin: "https://example.test",
    }));
    expect(o).toMatchObject({ country: "US", city: "Phoenix", userAgent: "smoke/1.0", referer: "https://example.test/a", origin: "https://example.test" });
  });

  it("labels which key name matched, never the secret itself", () => {
    vi.stubEnv("SEQUENCES_API_SECRET", "s3cret");
    const o = requestOrigin(req({ authorization: "Bearer s3cret" }));
    expect(o.keyLabel).toBe("SEQUENCES_API_SECRET");
    expect(JSON.stringify(o)).not.toContain("s3cret");
    vi.unstubAllEnvs();
  });

  it("labels an unrecognized bearer as unknown and no header as null", () => {
    expect(requestOrigin(req({ authorization: "Bearer wrong" })).keyLabel).toBe("unknown");
    expect(requestOrigin(req({})).keyLabel).toBeNull();
  });
});

describe("logApiRequest", () => {
  it("writes one row with the route, status and created sequence id", async () => {
    await logApiRequest({ ...requestOrigin(req({ "x-real-ip": "203.0.113.7" })), route: "/api/ai/sequences", status: 201, sequenceId: "abc", title: "T" });
    const [sql, params] = q.mock.calls[0];
    expect(sql).toContain("INSERT INTO sequence_api_requests");
    expect(params.slice(0, 4)).toEqual(["/api/ai/sequences", "POST", 201, "abc"]);
  });

  it("swallows a DB failure so the request it describes still succeeds", async () => {
    q.mockRejectedValueOnce(new Error("relation does not exist"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(logApiRequest({ ...requestOrigin(req({})), route: "/api/sequences", status: 200 })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
