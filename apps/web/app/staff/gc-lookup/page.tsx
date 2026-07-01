import { GcLookupContent } from "@/components/admin/gc-lookup-content";

export const dynamic = "force-dynamic";
export const metadata = { title: "GameChanger lookup", robots: { index: false } };

export default async function StaffGcLookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return <GcLookupContent basePath="/staff/gc-lookup" sp={sp} />;
}
