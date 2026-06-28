/**
 * Offline geocoding + distance helpers.
 *
 * We deliberately avoid an external geocoding API: the deploy environment has
 * restricted egress, and city-level accuracy is plenty for "teams within ~25
 * miles" scrimmage matching. `geocodeCity` looks up a bundled centroid table
 * keyed by normalized "city|state"; `haversineMiles` measures distance.
 *
 * The table is Utah-first (most teams are Utah youth clubs) with the larger
 * metros of neighboring states for cross-border play. It is intentionally
 * extensible — add rows to CITY_CENTROIDS as coverage grows nationally.
 *
 * Server-only: imported by the worker (scrape/backfill) and web server actions,
 * never by client components.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MI = 3958.7613;

/** Great-circle distance between two points, in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How much closer (in miles) an unconfirmed team must be to outrank a
 * coach-confirmed one. Confirmed teams get this much of a head start, so a
 * confirmed team beats any unconfirmed team within 50 miles of it — but a
 * much-closer unconfirmed team still wins. Matches the product rule: "if the
 * nearest confirmed team is >50 mi away, promote the closer team."
 */
export const CONFIRMED_BONUS_MI = 50;

// Located teams must always sort ahead of teams whose location is unknown.
const NO_LOCATION_BASE = 1_000_000;

/**
 * Sort key for a scrimmage candidate: lower is better. Confirmed teams subtract
 * CONFIRMED_BONUS_MI; teams without a known distance fall to the bottom (but a
 * confirmed no-location team still edges out an unconfirmed one).
 */
export function effectiveDistanceMi(
  distanceMiles: number | null | undefined,
  confirmed: boolean,
): number {
  const base = distanceMiles == null ? NO_LOCATION_BASE : distanceMiles;
  return confirmed ? base - CONFIRMED_BONUS_MI : base;
}

/** Normalize a city name for keying: lowercase, drop punctuation, fold "saint"→"st". */
function normCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^saint\s+/, "st ")
    .replace(/\s+/g, " ")
    .trim();
}

function key(city: string, state: string): string {
  return `${normCity(city)}|${state.toLowerCase().trim()}`;
}

/**
 * Look up an approximate centroid for a city/state. `zip` is accepted for a
 * future ZIP-centroid override but is currently unused (the scraper only
 * captures city/state). Returns null when the city is not in the table.
 */
export function geocodeCity(
  city: string | null | undefined,
  state: string | null | undefined,
  _zip?: string | null,
): LatLng | null {
  if (!city || !state) return null;
  return CITY_CENTROIDS[key(city, state)] ?? null;
}

// [city, state, lat, lng] — approximate city centroids. City-level precision is
// sufficient for ~25-mile matching. Keyed via normCity() at module load.
const RAW: ReadonlyArray<readonly [string, string, number, number]> = [
  // —— Utah (Wasatch Front + statewide) ——
  ["Salt Lake City", "UT", 40.7608, -111.891],
  ["West Valley City", "UT", 40.6916, -112.0011],
  ["West Jordan", "UT", 40.6097, -111.9391],
  ["Provo", "UT", 40.2338, -111.6585],
  ["Orem", "UT", 40.2969, -111.6946],
  ["Sandy", "UT", 40.5649, -111.8389],
  ["Ogden", "UT", 41.223, -111.9738],
  ["St. George", "UT", 37.0965, -113.5684],
  ["Layton", "UT", 41.0602, -111.9711],
  ["South Jordan", "UT", 40.5622, -111.9297],
  ["Lehi", "UT", 40.3916, -111.8508],
  ["Millcreek", "UT", 40.6869, -111.875],
  ["Taylorsville", "UT", 40.6677, -111.9388],
  ["Logan", "UT", 41.737, -111.8338],
  ["Murray", "UT", 40.6669, -111.888],
  ["Draper", "UT", 40.5247, -111.8638],
  ["Bountiful", "UT", 40.8894, -111.8808],
  ["Riverton", "UT", 40.5219, -111.9391],
  ["Roy", "UT", 41.1616, -112.0263],
  ["Spanish Fork", "UT", 40.115, -111.6549],
  ["Pleasant Grove", "UT", 40.3641, -111.7385],
  ["Springville", "UT", 40.1652, -111.6107],
  ["Cedar City", "UT", 37.6775, -113.0619],
  ["Kaysville", "UT", 41.0352, -111.9386],
  ["Herriman", "UT", 40.5141, -112.033],
  ["American Fork", "UT", 40.3769, -111.7958],
  ["Clearfield", "UT", 41.1108, -112.0263],
  ["Syracuse", "UT", 41.0894, -112.0647],
  ["Eagle Mountain", "UT", 40.3142, -112.0067],
  ["Saratoga Springs", "UT", 40.3491, -111.9046],
  ["Tooele", "UT", 40.5308, -112.2983],
  ["Farmington", "UT", 40.9805, -111.8874],
  ["Holladay", "UT", 40.6688, -111.8247],
  ["North Salt Lake", "UT", 40.8485, -111.9069],
  ["Cottonwood Heights", "UT", 40.6197, -111.8102],
  ["Midvale", "UT", 40.6111, -111.8999],
  ["Magna", "UT", 40.7091, -112.1016],
  ["Washington", "UT", 37.1303, -113.5083],
  ["Payson", "UT", 40.0444, -111.7321],
  ["Hurricane", "UT", 37.1753, -113.2899],
  ["Heber City", "UT", 40.507, -111.4133],
  ["Brigham City", "UT", 41.5102, -112.0155],
  ["Vernal", "UT", 40.4555, -109.5287],
  ["Price", "UT", 39.5994, -110.8107],
  ["Park City", "UT", 40.6461, -111.498],
  ["Smithfield", "UT", 41.8385, -111.8294],
  ["Hyrum", "UT", 41.6338, -111.8516],
  ["Centerville", "UT", 40.918, -111.8722],
  ["Lindon", "UT", 40.3416, -111.7208],
  ["Mapleton", "UT", 40.1297, -111.5785],
  ["Tremonton", "UT", 41.7102, -112.1655],
  ["Nephi", "UT", 39.7102, -111.8366],
  ["Vineyard", "UT", 40.2969, -111.7544],
  ["Highland", "UT", 40.4252, -111.7944],
  ["Kearns", "UT", 40.66, -111.9963],
  ["Pleasant View", "UT", 41.3221, -111.9869],
  ["South Salt Lake", "UT", 40.7089, -111.8883],
  ["Grantsville", "UT", 40.6, -112.4644],
  ["Stansbury Park", "UT", 40.6383, -112.2966],
  ["Moab", "UT", 38.5733, -109.5498],
  // —— Neighboring-state metros (cross-border tournaments) ——
  ["Las Vegas", "NV", 36.1699, -115.1398],
  ["Henderson", "NV", 36.0397, -114.9819],
  ["Reno", "NV", 39.5296, -119.8138],
  ["Mesquite", "NV", 36.8055, -114.0672],
  ["Boise", "ID", 43.615, -116.2023],
  ["Meridian", "ID", 43.6121, -116.3915],
  ["Nampa", "ID", 43.5407, -116.5635],
  ["Idaho Falls", "ID", 43.4917, -112.0331],
  ["Pocatello", "ID", 42.8713, -112.4455],
  ["Twin Falls", "ID", 42.5558, -114.4701],
  ["Rexburg", "ID", 43.826, -111.7897],
  ["Denver", "CO", 39.7392, -104.9903],
  ["Colorado Springs", "CO", 38.8339, -104.8214],
  ["Grand Junction", "CO", 39.0639, -108.5506],
  ["Fort Collins", "CO", 40.5853, -105.0844],
  ["Phoenix", "AZ", 33.4484, -112.074],
  ["Mesa", "AZ", 33.4152, -111.8315],
  ["Gilbert", "AZ", 33.3528, -111.789],
  ["Scottsdale", "AZ", 33.4942, -111.9261],
  ["Flagstaff", "AZ", 35.1983, -111.6513],
  ["Rock Springs", "WY", 41.5875, -109.2029],
  ["Evanston", "WY", 41.2683, -110.9632],
  ["Cheyenne", "WY", 41.14, -104.8202],
  ["Albuquerque", "NM", 35.0844, -106.6504],
];

const CITY_CENTROIDS: Record<string, LatLng> = Object.fromEntries(
  RAW.map(([city, state, lat, lng]) => [key(city, state), { lat, lng }]),
);
