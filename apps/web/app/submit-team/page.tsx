import type { Metadata } from "next";
import { SubmitTeamForm } from "@/components/submit-team-form";

export const metadata: Metadata = {
  title: "Add a Team",
  description:
    "Add your baseball team to the National Baseball Ratings by submitting its GameChanger team ID.",
  alternates: { canonical: "/submit-team" },
};

export default function SubmitTeamPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-black text-navy-900">Add a team</h1>
      <p className="mb-6 mt-2 max-w-2xl text-slate-600">
        Don’t see a team in the ratings? Submit its GameChanger team ID and we’ll start
        collecting its scores. Ratings appear once a team has played enough games to rate.
      </p>

      <div className="mb-6 max-w-2xl rounded-xl border border-navy-700/15 bg-navy-50 p-5">
        <h2 className="text-sm font-bold text-navy-900">How to find your GameChanger team ID</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Open the <strong>GameChanger</strong> app and select your team.</li>
          <li>Tap <strong>Settings</strong> (the gear icon) on your team’s page.</li>
          <li>
            Find your team’s ID there, or tap <strong>Share team</strong> — the link looks like{" "}
            <code className="rounded bg-white px-1">web.gc.com/teams/<b>THIS-PART</b>/schedule</code>.
          </li>
          <li>Copy that ID (about 12 letters/numbers, e.g. <code className="rounded bg-white px-1">21nCCNFQXjHB</code>) and paste it below.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          No login needed — anyone can add a team. We only use the public schedule and scores.
        </p>
      </div>

      <SubmitTeamForm />
    </div>
  );
}
