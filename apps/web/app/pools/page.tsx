import type { Metadata } from "next";
import { PoolGeneratorClient } from "@/components/pool-generator-client";

export const metadata: Metadata = {
  title: "Tournament Pool Generator — Balanced Pools in Seconds",
  description:
    "Free tournament pool generator. Select teams and let our rating-based serpentine seeding create balanced pools so the strongest teams are split fairly across pools.",
  alternates: { canonical: "/pools" },
};

export default function PoolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print mb-6">
        <h1 className="text-2xl font-black text-navy-900">Tournament Pool Generator</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Stop guessing at fair pools. Add the teams in your tournament and we’ll use their
          National Baseball Ratings to spread the strongest and weakest teams evenly across
          pools — using the same serpentine seeding method the pros use. Free, no login
          required.
        </p>
      </div>
      <PoolGeneratorClient />
    </div>
  );
}
