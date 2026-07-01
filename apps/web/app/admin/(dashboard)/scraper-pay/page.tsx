import { getScraperLeaderboard, getScrapePayRateCents, getScrapeGoals } from "@nbr/db";
import { ScraperLeaderboard } from "@/components/admin/scraper-leaderboard";
import { ScrapePaySettings } from "@/components/admin/scrape-pay-settings";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scraper pay", robots: { index: false } };

export default async function ScraperPayPage() {
  const [rows, rateCents, goals] = await Promise.all([
    getScraperLeaderboard(),
    getScrapePayRateCents(),
    getScrapeGoals(),
  ]);
  const owed = rows.reduce((a, r) => a + r.unpaidCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-black text-navy-900">Scraper pay</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Set the per-team rate and goals, track what each scraper has added, and mark them paid.
          Marking paid banks their unpaid credits and resets their &ldquo;since last payout&rdquo; to
          zero. Total currently owed: <strong>{formatUsd(owed)}</strong>.
        </p>
      </div>

      <ScrapePaySettings rateCents={rateCents} goals={goals} />

      <ScraperLeaderboard rows={rows} admin />
    </div>
  );
}
