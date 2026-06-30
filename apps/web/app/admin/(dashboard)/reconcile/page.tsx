import { getReconcileSnapshot } from "@/lib/reconcile";
import { ReconcileReview } from "@/components/admin/reconcile-review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconcile", robots: { index: false } };

export default async function ReconcilePage() {
  const snapshot = await getReconcileSnapshot();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-navy-900">Reconcile: DB vs GameChanger</h1>
      <div className="mb-6 max-w-3xl space-y-3 text-sm text-slate-600">
        <p>
          This page compares what we have stored against each team&rsquo;s <strong>real
          GameChanger schedule</strong>, captured by the <code>nbr-reconcile</code> worker. The
          capture hits GameChanger once and saves the result, so all the review and deleting here
          happens <strong>offline — no re-scraping</strong>.
        </p>
        <p>
          <strong>Phantom games</strong> are in our database but not on the team&rsquo;s own page
          (usually mis-attributed by the old merge bugs) — delete the ones that don&rsquo;t belong.
          <strong> Dead GameChanger IDs</strong> are teams whose page shows nothing online; clear the
          bad ID and merge the row into the real team elsewhere. Merging duplicate <em>teams</em> is
          still done on the Duplicates/Ghosts pages — this page only removes bad <em>games</em>.
        </p>
      </div>

      {!snapshot ? (
        <div className="card p-10 text-center">
          <p className="text-4xl">📷</p>
          <p className="mt-2 text-lg font-semibold text-navy-900">No capture yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Run the <strong>nbr-reconcile</strong> worker with no <code>RECONCILE_TEAM</code> set (a
            full read-only capture). When it finishes, refresh this page to review phantom games and
            dead IDs.
          </p>
        </div>
      ) : (
        <ReconcileReview snapshot={snapshot} />
      )}
    </div>
  );
}
