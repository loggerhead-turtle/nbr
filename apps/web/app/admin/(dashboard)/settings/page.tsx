import { getRatingAlgorithm } from "@/lib/settings";
import { RatingAlgorithmForm } from "@/components/admin/settings-form";

export const metadata = { title: "Settings", robots: { index: false } };

export default async function AdminSettingsPage() {
  const current = await getRatingAlgorithm();

  return (
    <div>
      <h1 className="text-2xl font-black text-navy-900">Site settings</h1>
      <p className="mt-1 text-sm text-slate-500">Configuration for ratings and site behaviour.</p>
      <div className="mt-6">
        <RatingAlgorithmForm current={current} />
      </div>
    </div>
  );
}
