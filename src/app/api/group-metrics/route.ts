import { NextResponse } from "next/server";
import { buildDashboardMetrics } from "@/lib/metrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  groupIds: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
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

  const { month, groupIds } = parseResult.data;
  const selectedMonth =
    month ?? new Date().toISOString().slice(0, 7); /* AAAA-MM */
  const parsedGroupIds = groupIds
    ? groupIds
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;

  try {
    const metrics = await buildDashboardMetrics(
      { month: selectedMonth, groupIds: parsedGroupIds },
      { includeGroupStats: true }
    );

    return NextResponse.json({
      meta: {
        period: metrics.meta.period,
        generatedAt: metrics.meta.generatedAt,
      },
      kpis: metrics.kpis,
      availability: metrics.availability,
      totals: metrics.groupTotals,
      groups: metrics.groupSummaries ?? [],
      severitySummary: metrics.severitySummary,
      criticalAlerts: metrics.criticalAlerts,
    });
  } catch (error) {
    console.error("[group-metrics] Failed to build overview", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o panorama geral.",
      },
      { status: 500 }
    );
  }
}
