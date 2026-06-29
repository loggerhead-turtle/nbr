/**
 * Sunset time from latitude/longitude and a calendar date, using the standard
 * "Almanac for Computers" sunrise/sunset algorithm. Pure and deterministic.
 *
 * Returns local minutes-from-midnight (0–1439) given the location's UTC offset.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const sin = (d: number) => Math.sin(d * D2R);
const cos = (d: number) => Math.cos(d * D2R);
const tan = (d: number) => Math.tan(d * D2R);
const asin = (x: number) => Math.asin(x) * R2D;
const acos = (x: number) => Math.acos(x) * R2D;
const atan = (x: number) => Math.atan(x) * R2D;
const norm = (v: number, max: number) => ((v % max) + max) % max;

function dayOfYearUTC(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((today - startOfYear) / 86_400_000);
}

/**
 * @param lat  latitude in degrees (north positive)
 * @param lng  longitude in degrees (east positive, so the US is negative)
 * @param date the calendar date (UTC date parts are used)
 * @param tzOffsetMinutes the location's UTC offset in minutes (e.g. -360 for MDT)
 */
export function sunsetMinutes(lat: number, lng: number, date: Date, tzOffsetMinutes: number): number {
  const ZENITH = 90.833; // official sunset (sun's upper limb at the horizon)
  const N = dayOfYearUTC(date);
  const lngHour = lng / 15;

  const t = N + (18 - lngHour) / 24; // 18 = approximate hour for sunset
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * sin(M) + 0.02 * sin(2 * M) + 282.634;
  L = norm(L, 360);

  let RA = atan(0.91764 * tan(L));
  RA = norm(RA, 360);
  // Right ascension must be in the same quadrant as L.
  const Lquad = Math.floor(L / 90) * 90;
  const RAquad = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquad - RAquad)) / 15;

  const sinDec = 0.39782 * sin(L);
  const cosDec = cos(asin(sinDec));
  const cosH = (cos(ZENITH) - sinDec * sin(lat)) / (cosDec * cos(lat));
  if (cosH < -1 || cosH > 1) {
    // Sun never sets (polar summer) / never rises — fall back to ~8:30pm.
    return 20 * 60 + 30;
  }

  const H = acos(cosH) / 15; // sunset uses acos directly
  const T = H + RA - 0.06571 * t - 6.622;
  const UT = norm(T - lngHour, 24);
  const local = norm(UT + tzOffsetMinutes / 60, 24);
  return Math.round(local * 60);
}

/** "HH:MM" for minutes-from-midnight. */
export function minutesToHM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * US Mountain Time UTC offset (minutes) for a date — MDT (-360) during daylight
 * saving (2nd Sunday March → 1st Sunday November), otherwise MST (-420). A
 * lightweight rule that's accurate for tournament-season dates.
 */
export function mountainOffsetMinutes(date: Date): number {
  const y = date.getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1));
    const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
    return new Date(Date.UTC(y, month, firstSunday + (n - 1) * 7));
  };
  const dstStart = nthSunday(2, 2); // 2nd Sunday in March
  const dstEnd = nthSunday(10, 1); // 1st Sunday in November
  const inDst = date >= dstStart && date < dstEnd;
  return inDst ? -360 : -420;
}
