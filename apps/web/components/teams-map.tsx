"use client";

import { useEffect, useRef } from "react";
import type { MapPoint } from "@/lib/queries";

// Leaflet is loaded from CDN at runtime (no bundle dependency / lockfile change).
const LEAFLET_VERSION = "1.9.4";
const CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

const COLORS: Record<MapPoint["tier"], string> = {
  green: "#10b981", // verified + coach
  gray: "#94a3b8", // verified, unclaimed
  ghost: "#e2e8f0", // unverified (scraped opponent)
};

function ensureLeaflet(): Promise<unknown> {
  const w = window as unknown as { L?: unknown; __leafletLoading?: Promise<unknown> };
  if (w.L) return Promise.resolve(w.L);
  if (w.__leafletLoading) return w.__leafletLoading;

  if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_URL;
    document.head.appendChild(link);
  }
  w.__leafletLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = JS_URL;
    script.async = true;
    script.onload = () => resolve(w.L);
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return w.__leafletLoading;
}

export function TeamsMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    ensureLeaflet().then((L: any) => {
      if (cancelled || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { scrollWheelZoom: false }).setView([39.5, -111.6], 6);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18,
      }).addTo(map);

      const latlngs: [number, number][] = [];
      // Draw ghosts first so verified/coached markers sit on top.
      const order: MapPoint["tier"][] = ["ghost", "gray", "green"];
      const sorted = [...points].sort(
        (a, b) => order.indexOf(a.tier) - order.indexOf(b.tier),
      );
      for (const p of sorted) {
        latlngs.push([p.lat, p.lng]);
        L.circleMarker([p.lat, p.lng], {
          radius: p.tier === "ghost" ? 4 : 6,
          color: "#0f1f47",
          weight: p.tier === "ghost" ? 0.5 : 1,
          fillColor: COLORS[p.tier],
          fillOpacity: p.tier === "ghost" ? 0.5 : 0.9,
        })
          .addTo(map)
          .bindPopup(
            `<a href="/teams/${p.slug}" style="font-weight:600;color:#1e3a8a">${escapeHtml(
              p.name,
            )}</a>`,
          );
      }
      if (latlngs.length > 0) {
        map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 10 });
      }
      // Settle layout once the container is sized (mobile).
      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m?.remove) m.remove();
      mapRef.current = null;
    };
  }, [points]);

  return <div ref={ref} className="h-[70vh] min-h-[360px] w-full rounded-xl border border-slate-200" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
