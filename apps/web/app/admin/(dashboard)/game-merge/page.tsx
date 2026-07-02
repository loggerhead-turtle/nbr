import { getOpenGameMergeCandidates } from "@nbr/db";
import { GameMergeReview } from "@/components/admin/game-merge-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Game merge queue", robots: { index: false } };

export default async function GameMergePage() {
  const items = await getOpenGameMergeCandidates(60);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Game merge queue</h1>
      <div className="mb-6 max-w-3xl space-y-3 text-sm text-slate-600">
        <p>
          Each card is <strong>one day where two teams&rsquo; schedules disagree on how many games
          they played each other</strong> — for example one lists a doubleheader (two games) and the
          other lists a single game. Completed GameChanger games carry no start time, so the scraper
          can&rsquo;t tell a real doubleheader apart from a game that was entered twice but played
          once. Rather than guess — which would either drop a real game or invent one — it parks the
          matchup here for you to decide.
        </p>
        <p>
          When both schedules <em>agree</em> on the count, the scraper resolves it automatically and
          nothing lands here: two games on both sides are kept as a doubleheader, one game on both
          sides is kept once (any score disagreement is treated as a data-entry typo and ignored).
          Only a genuine <strong>count mismatch</strong> reaches this queue.
        </p>
        <p>
          Use the blue <strong>GC ↗</strong> buttons to open each team&rsquo;s GameChanger schedule
          and see what really happened, then choose: <strong>Real doubleheader</strong> keeps both
          games; <strong>One game entered twice</strong> collapses the stored rows to a single game;{" "}
          <strong>Dismiss</strong> closes the conflict without changing anything. This is separate
          from the <strong>Duplicates</strong> page on purpose — these are two <em>different</em>{" "}
          teams, so a differing game count is not evidence to merge the team records.
        </p>
      </div>
      <GameMergeReview items={items} />
    </div>
  );
}
