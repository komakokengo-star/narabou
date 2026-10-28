import { describe, expect, it } from "vitest";
import { availabilityInput, isAvailabilityActive } from "../availability";

describe("worker availability", () => {
  const now = Date.parse("2026-10-28T02:00:00Z");
  it("counts an opted-in worker before expiry", () => {
    expect(isAvailabilityActive({ area: "福岡", is_available: true, expires_at: "2026-10-28T02:05:00Z" }, now)).toBe(true);
  });
  it("excludes a worker who ended reception", () => {
    expect(isAvailabilityActive({ area: "福岡", is_available: false, expires_at: "2026-10-28T02:05:00Z" }, now)).toBe(false);
  });
  it("excludes stale reception at the exact expiry", () => {
    expect(isAvailabilityActive({ area: "福岡", is_available: true, expires_at: "2026-10-28T02:00:00Z" }, now)).toBe(false);
  });
  it("requires a supported area for reception", () => {
    expect(availabilityInput.safeParse({ area: "未指定", available: true }).success).toBe(false);
    expect(availabilityInput.safeParse({ area: "福岡", available: true }).success).toBe(true);
  });
});