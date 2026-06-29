/**
 * Tiny zip → lat/lng lookup for the demo's sunset auto-calc. Covers the
 * Utah zips used in the sample data, with a Salt Lake City fallback for
 * anything unknown (the demo is Utah-centric).
 */
export interface LatLng {
  lat: number;
  lng: number;
}

const SLC: LatLng = { lat: 40.7608, lng: -111.891 };

const ZIP_LATLNG: Record<string, LatLng> = {
  "84101": SLC, // Salt Lake City
  "84601": { lat: 40.2338, lng: -111.6585 }, // Provo
  "84097": { lat: 40.3141, lng: -111.7041 }, // Orem
  "84401": { lat: 41.223, lng: -111.9738 }, // Ogden
  "84321": { lat: 41.7355, lng: -111.8344 }, // Logan
  "84770": { lat: 37.0965, lng: -113.5684 }, // St. George
  "84720": { lat: 37.6775, lng: -113.0619 }, // Cedar City
  "84032": { lat: 40.5069, lng: -111.4685 }, // Heber City
  "84660": { lat: 40.1135, lng: -111.6549 }, // Spanish Fork
  "84003": { lat: 40.3769, lng: -111.7958 }, // American Fork
  "84043": { lat: 40.3916, lng: -111.8508 }, // Lehi
  "84095": { lat: 40.5571, lng: -111.9605 }, // South Jordan
  "84078": { lat: 40.4555, lng: -109.5287 }, // Vernal
};

export function zipToLatLng(zip: string): LatLng {
  return ZIP_LATLNG[zip.trim().slice(0, 5)] ?? SLC;
}
