import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@nbr/db";
import { getCurrentUser } from "@/lib/user-auth";
import { ClaimForm } from "@/components/account/claim-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Claim your team", robots: { index: false } };

export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await prisma.team.findUnique({ where: { slug }, include: { claim: true } });
  if (!team) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/claim/${slug}`)}`);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href={`/teams/${team.slug}`} className="text-sm text-navy-700 hover:underline">
        ← Back to {team.name}
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-black text-navy-900">Claim your team</h1>
      {team.claim ? (
        <div className="card p-6 text-sm text-slate-600">
          This team has already been claimed. If you believe this is incorrect, you can report it
          from the{" "}
          <Link href={`/teams/${team.slug}`} className="font-medium text-navy-700 underline">
            team page
          </Link>
          .
        </div>
      ) : (
        <ClaimForm teamId={team.id} teamName={team.name} />
      )}
    </div>
  );
}
