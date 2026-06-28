import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { loadThread } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { ThreadPanel } from "@/components/account/thread-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages", robots: { index: false } };

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/messages/${id}`);

  const thread = await loadThread(id, user.id);
  if (!thread) notFound();

  // Mark this thread read for the viewer (clears their unread badge).
  await prisma.scrimmageRequest.update({
    where: { id },
    data: thread.side === "from" ? { fromReadAt: new Date() } : { toReadAt: new Date() },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/account" className="text-sm text-navy-700 hover:underline">
        ← Account
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-black text-navy-900">
          {thread.myTeamName} ↔{" "}
          {thread.otherTeam ? (
            <Link href={`/teams/${thread.otherTeam.slug}`} className="hover:underline">
              {thread.otherTeam.name}
            </Link>
          ) : (
            "a team"
          )}
        </h1>
        <span className="badge bg-slate-200 text-slate-700">{thread.status}</span>
      </div>

      {(thread.otherEmail || thread.otherPhone) && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="font-semibold">{thread.otherName ?? "The other coach"} shared:</span>{" "}
          {thread.otherEmail && (
            <a href={`mailto:${thread.otherEmail}`} className="underline">
              {thread.otherEmail}
            </a>
          )}
          {thread.otherEmail && thread.otherPhone ? " · " : ""}
          {thread.otherPhone && <span>{thread.otherPhone}</span>}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {thread.messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet — say hello.</p>
        ) : (
          thread.messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                  m.mine ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[10px] ${m.mine ? "text-navy-100" : "text-slate-400"}`}>
                  {formatDate(m.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <ThreadPanel
        requestId={thread.id}
        myShareEmail={thread.myShareEmail}
        mySharePhone={thread.mySharePhone}
      />
    </div>
  );
}
