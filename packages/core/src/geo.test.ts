import { describe, it, expect } from "vitest";
import {
  haversineMiles,
  geocodeCity,
  effectiveDistanceMi,
  CONFIRMED_BONUS_MI,
} from "./geo.js";

describe("haversineMiles", () => {
  it("is zero for the same point", () => {
    expect(haversineMiles({ lat: 40.76, lng: -111.89 }, { lat: 40.76, lng: -111.89 })).toBe(0);
  });

  it("matches a known city-to-city distance (SLC↔Provo ≈ 43 mi)", () => {
    const slc = geocodeCity("Salt Lake City", "UT")!;
    const provo = geocodeCity("Provo", "UT")!;
    const d = haversineMiles(slc, provo);
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(48);
  });
});

describe("geocodeCity", () => {
  it("looks up a known city case/punctuation-insensitively", () => {
    expect(geocodeCity("salt lake city", "ut")).toEqual(geocodeCity("Salt Lake City", "UT"));
    expect(geocodeCity("St George", "UT")).toEqual(geocodeCity("St. George", "UT"));
  });

  it("returns null for unknown or missing input", () => {
    expect(geocodeCity("Nowhereville", "UT")).toBeNull();
    expect(geocodeCity(null, "UT")).toBeNull();
    expect(geocodeCity("Provo", null)).toBeNull();
  });
});

describe("effectiveDistanceMi (confirmed-vs-distance ranking)", () => {
  it("ranks a confirmed team above an unconfirmed one within the bonus", () => {
    // Confirmed at 30mi vs unconfirmed at 5mi → confirmed wins (30-50 < 5).
    expect(effectiveDistanceMi(30, true)).toBeLessThan(effectiveDistanceMi(5, false));
  });

  it("lets a much-closer unconfirmed team beat a far confirmed one (>50mi rule)", () => {
    // Confirmed at 60mi vs unconfirmed at 5mi → unconfirmed wins (60-50 > 5).
    expect(effectiveDistanceMi(5, false)).toBeLessThan(effectiveDistanceMi(60, true));
  });

  it("uses exactly CONFIRMED_BONUS_MI as the head start", () => {
    expect(effectiveDistanceMi(100, true)).toBe(100 - CONFIRMED_BONUS_MI);
    expect(effectiveDistanceMi(100, false)).toBe(100);
  });

  it("sorts located teams ahead of unknown-location teams", () => {
    expect(effectiveDistanceMi(500, false)).toBeLessThan(effectiveDistanceMi(null, true));
  });

  it("confirmed no-location edges out unconfirmed no-location", () => {
    expect(effectiveDistanceMi(null, true)).toBeLessThan(effectiveDistanceMi(null, false));
  });
});
