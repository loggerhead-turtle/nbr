import { TeamForm } from "@/components/admin/team-form";
import { QuickAddForm } from "@/components/admin/quick-add-form";

export const metadata = { title: "Add team", robots: { index: false } };

export default function NewTeamPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-black text-navy-900">Add teams</h1>
        <p className="text-sm text-slate-500">
          Fastest: paste GameChanger IDs below and let the scraper fill in the details. Or add a
          single team with full details further down.
        </p>
      </div>

      <QuickAddForm />

      <div>
        <h2 className="mb-1 text-lg font-bold text-navy-900">Add one team with details</h2>
        <p className="mb-4 text-sm text-slate-500">
          Use this if you want to set the name/location yourself, or add a manual-only team
          without a GameChanger ID.
        </p>
        <TeamForm />
      </div>
    </div>
  );
}
