import { TeamForm } from "@/components/admin/team-form";

export const metadata = { title: "Add team", robots: { index: false } };

export default function NewTeamPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Add a team</h1>
      <p className="mb-6 text-sm text-slate-500">
        Add a team manually or link a GameChanger team ID so the scraper can collect scores.
      </p>
      <TeamForm />
    </div>
  );
}
