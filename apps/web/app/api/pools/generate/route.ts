import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, Prisma } from "@nbr/db";
import { generatePools, poolGenerateSchema } from "@nbr/core";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = poolGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const { teams, numPools, name } = parsed.data;
  if (numPools > teams.length) {
    return NextResponse.json(
      { error: `Cannot make ${numPools} pools from ${teams.length} teams.` },
      { status: 400 },
    );
  }

  const result = generatePools(teams, numPools);

  const save = new URL(req.url).searchParams.get("save") === "1";
  let token: string | null = null;
  if (save) {
    token = randomBytes(9).toString("base64url");
    await prisma.tournamentPool.create({
      data: {
        token,
        name: name ?? null,
        numPools,
        config: { teams, name } as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return NextResponse.json({ result, token });
}
