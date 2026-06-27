import type { MetadataRoute } from "next";
import { getAllTeamSlugs } from "@/lib/queries";

const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/pools", "/about", "/faq", "/terms", "/privacy", "/submit-team"].map(
    (p) => ({
      url: `${base}${p}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: p === "" ? 1 : 0.6,
    }),
  );

  let teams: { slug: string; updatedAt: Date }[] = [];
  try {
    teams = await getAllTeamSlugs();
  } catch {
    // DB unavailable at build time — ship the static routes only.
  }

  const teamRoutes = teams.map((t) => ({
    url: `${base}/teams/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...teamRoutes];
}
