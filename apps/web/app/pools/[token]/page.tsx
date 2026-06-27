import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@nbr/db";
import type { PoolResult } from "@nbr/core";
import { PoolResultView } from "@/components/pool-result";

type Params = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Shared Tournament Pools",
  robots: { index: false },
};

export default async function SharedPoolPage({ params }: Params) {
  const { token } = await params;
  const saved = await prisma.tournamentPool.findUnique({ where: { token } });
  if (!saved) notFound();

  const result = saved.result as unknown as PoolResult;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="no-print mb-4">
        <Link href="/pools" className="text-sm text-navy-700 hover:underline">
          ← Make your own pools
        </Link>
      </div>
      <div className="card p-6">
        <PoolResultView result={result} name={saved.name ?? undefined} />
      </div>
    </div>
  );
}
