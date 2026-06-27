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
      <SubmitTeamForm />
    </div>
  );
}
