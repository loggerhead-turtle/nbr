import { describe, it, expect } from "vitest";
import { sunsetMinutes, minutesToHM, mountainOffsetMinutes } from "./sun.js";

// Salt Lake City.
const LAT = 40.7608;
const LNG = -111.891;

describe("sunsetMinutes", () => {
  it("gives a late sunset near the summer solstice (SLC, MDT)", () => {
    const d = new Date("2026-06-21T00:00:00Z");
    const m = sunsetMinutes(LAT, LNG, d, mountainOffsetMinutes(d));
    // SLC sunset ~9:00 PM MDT in late June.
    expect(m).toBeGreaterThan(20 * 60 + 30);
    expect(m).toBeLessThan(21 * 60 + 30);
  });

  it("gives an early sunset near the winter solstice (SLC, MST)", () => {
    const d = new Date("2026-12-21T00:00:00Z");
    const m = sunsetMinutes(LAT, LNG, d, mountainOffsetMinutes(d));
    // SLC sunset ~5:00 PM MST in late December.
    expect(m).toBeGreaterThan(16 * 60 + 30);
    expect(m).toBeLessThan(17 * 60 + 30);
  });

  it("summer sunset is later than winter sunset", () => {
    const summer = new Date("2026-06-21T00:00:00Z");
    const winter = new Date("2026-12-21T00:00:00Z");
    expect(sunsetMinutes(LAT, LNG, summer, mountainOffsetMinutes(summer))).toBeGreaterThan(
      sunsetMinutes(LAT, LNG, winter, mountainOffsetMinutes(winter)),
    );
  });

  it("mountainOffsetMinutes picks MDT in summer and MST in winter", () => {
    expect(mountainOffsetMinutes(new Date("2026-07-01T00:00:00Z"))).toBe(-360);
    expect(mountainOffsetMinutes(new Date("2026-01-01T00:00:00Z"))).toBe(-420);
  });

  it("minutesToHM formats correctly", () => {
    expect(minutesToHM(8 * 60)).toBe("08:00");
    expect(minutesToHM(20 * 60 + 5)).toBe("20:05");
  });
});
