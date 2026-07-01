import { GcLookupContent } from "@/components/admin/gc-lookup-content";
import { RescrapeRecentButton } from "@/components/admin/rescrape-recent-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameChanger lookup", robots: { index: false } };

export default async function GcLookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <GcLookupContent basePath="/admin/gc-lookup" sp={sp} headerExtra={<RescrapeRecentButton />} />
  );
}
