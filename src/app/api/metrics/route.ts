import { NextResponse } from "next/server";
import { buildDashboardMetrics } from "@/lib/metrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  groupId: z.string().optional(),
  groupIds: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
    groupId: searchParams.get("groupId") ?? undefined,
    groupIds: searchParams.get("groupIds") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Parâmetros inválidos",
        details: parseResult.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { month, groupId, groupIds } = parseResult.data;

  const selectedMonth =
    month ??
    new Date().toISOString().slice(0, 7); /* formato AAAA-MM */
  const parsedGroupIds = groupIds
    ? groupIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  try {
    const metrics = await buildDashboardMetrics({
      month: selectedMonth,
      groupId: groupId || undefined,
      groupIds: parsedGroupIds,
    });
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("[metrics] Failed to build dashboard", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as métricas.",
      },
      { status: 500 }
    );
  }
}
