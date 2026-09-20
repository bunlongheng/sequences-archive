import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireflies } from "@/app/fireflies";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// fireflies() is pure DOM work, so it is tested here rather than through the UI -
// driving it end to end would mean deleting a real row from the shared database.

function cardAt(x: number, y: number, w: number, h: number) {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
  document.body.append(el);
  return el;
}

const mockReducedMotion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
};

describe("fireflies", () => {
  beforeEach(() => { document.body.innerHTML = ""; vi.useFakeTimers(); mockReducedMotion(false); });
  afterEach(() => { vi.useRealTimers(); });

  it("pins the swarm over the card it replaces", () => {
    fireflies(cardAt(120, 340, 260, 180));
    const field = document.querySelector(".ff-field") as HTMLElement;
    expect(field).not.toBeNull();
    expect(field.style.left).toBe("120px");
    expect(field.style.top).toBe("340px");
    expect(field.style.width).toBe("260px");
    expect(field.style.height).toBe("180px");
  });

  it("scales the swarm to the card area, within bounds", () => {
    fireflies(cardAt(0, 0, 260, 180));
    const n = document.querySelectorAll(".ff-field i").length;
    expect(n).toBeGreaterThanOrEqual(18);
    expect(n).toBeLessThanOrEqual(70);
  });

  it("caps the swarm on a very large card", () => {
    fireflies(cardAt(0, 0, 4000, 3000));
    expect(document.querySelectorAll(".ff-field i").length).toBe(70);
  });

  it("keeps a floor on a tiny card", () => {
    fireflies(cardAt(0, 0, 20, 12));
    expect(document.querySelectorAll(".ff-field i").length).toBe(18);
  });

  it("gives every speck its own drift, delay and duration", () => {
    fireflies(cardAt(0, 0, 260, 180));
    const bits = [...document.querySelectorAll<HTMLElement>(".ff-field i")];
    for (const b of bits) {
      expect(b.style.getPropertyValue("--dx")).toMatch(/-?[\d.]+px/);
      // fireflies only ever rise
      expect(parseFloat(b.style.getPropertyValue("--dy"))).toBeLessThan(0);
      expect(b.style.animationDuration).toMatch(/[\d.]+s/);
    }
    expect(new Set(bits.map(b => b.style.getPropertyValue("--dx"))).size).toBeGreaterThan(1);
  });

  it("removes the field so it cannot pile up", () => {
    fireflies(cardAt(0, 0, 260, 180));
    expect(document.querySelectorAll(".ff-field").length).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(document.querySelectorAll(".ff-field").length).toBe(0);
  });

  it("does nothing when the card is gone or unmeasurable", () => {
    fireflies(null);
    fireflies(cardAt(0, 0, 0, 0)); // already unmounted - would land top-left
    expect(document.querySelector(".ff-field")).toBeNull();
  });

  it("respects prefers-reduced-motion", () => {
    mockReducedMotion(true);
    fireflies(cardAt(0, 0, 260, 180));
    expect(document.querySelector(".ff-field")).toBeNull();
  });
});

// The swarm is only ever as good as its anchor. deleteDiagram() locates the
// element to scatter with [data-seq-id], and fireflies() returns silently when
// that lookup misses - which is exactly how the list view shipped without the
// effect while every test above still passed. Both of the things a user can
// delete from must carry the hook, so assert it at the source.
describe("the delete hook both views must carry", () => {
  const src = readFileSync(join(process.cwd(), "app/SequencesClient.tsx"), "utf8");

  // Take each component's body as the text from its declaration up to the next
  // top-level `function`, which is how this file separates its components.
  const bodyOf = (name: string) => {
    const start = src.indexOf(`function ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const next = src.indexOf("\nfunction ", start + 1);
    return src.slice(start, next === -1 ? undefined : next);
  };

  for (const name of ["SequenceCard", "DiagramRow"]) {
    it(`${name} renders data-seq-id so a delete can find it`, () => {
      expect(bodyOf(name)).toContain("data-seq-id={d.id}");
    });
  }

  it("deleteDiagram looks the element up by that attribute", () => {
    expect(src).toContain('fireflies(document.querySelector(`[data-seq-id="${id}"]`))');
  });
});
