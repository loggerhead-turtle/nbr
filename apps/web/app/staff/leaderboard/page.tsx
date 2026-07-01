import { getScraperLeaderboard } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { ScraperLeaderboard } from "@/components/admin/scraper-leaderboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scraper leaderboard", robots: { index: false } };

export default async function StaffLeaderboardPage() {
  const [rows, user] = await Promise.all([getScraperLeaderboard(), getCurrentUser()]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Leaderboard</h1>
      <p className="mb-5 max-w-2xl text-sm text-slate-500">
        How the team is doing — teams added today, this week, and this month, plus what&rsquo;s owed
        since each person&rsquo;s last payout. Your row is highlighted.
      </p>
      <ScraperLeaderboard rows={rows} currentUserId={user?.id} />
    </div>
  );
}
