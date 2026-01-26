import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { ptBR } from "date-fns/locale";
import { buildReachabilityReport } from "@/lib/reachability-report";
import { formatDurationMinutes } from "@/lib/time-format";

const DEFAULT_TIMEZONE =
  process.env.DASHBOARD_TIMEZONE ?? "America/Sao_Paulo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");
  const scopeParam = searchParams.get("scope");
  const groupIdsParam = searchParams.get("groupIds");
  const groupIds = groupIdsParam
    ? groupIdsParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined;
  const isAllScope = scopeParam === "all" || groupId === "all";
  if (!groupId && !isAllScope) {
    return new NextResponse("Parametro groupId obrigatorio.", { status: 400 });
  }

  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const windowParam = searchParams.get("window");
  const window = windowParam === "overall" ? "overall" : "business";

  const report = await buildReachabilityReport({
    groupId: isAllScope ? undefined : groupId ?? undefined,
    groupIds,
    scope: isAllScope ? "all" : "group",
    month,
    window,
    page: 1,
    pageSize: Number.MAX_SAFE_INTEGER,
  });

  const header = isAllScope
    ? "host_group,event_id,alerta,severidade,tipo,item_keys,hosts,abertura,dia_semana_abertura,janela_abertura,fechamento,downtime_janela,downtime_total,status"
    : "event_id,alerta,severidade,tipo,item_keys,hosts,abertura,dia_semana_abertura,janela_abertura,fechamento,downtime_janela,downtime_total,status";
  const rows = report.alerts.map((alert) => {
    const baseCells = [
      alert.eventId,
      csvSafe(alert.name),
      csvSafe(alert.severityLabel),
      csvSafe(alert.alertType),
      csvSafe(alert.itemKeys.join(" | ")),
      csvSafe(alert.hostNames.join(" | ")),
      formatExportDate(alert.openedAt),
      formatExportWeekday(alert.openedAt),
      alert.openedInBusinessWindow ? "7h-23:59" : "Fora",
      formatExportDate(alert.closedAt),
      formatDurationMinutes(alert.windowMinutes),
      formatDurationMinutes(alert.totalMinutes),
      alert.isOpen ? "Em aberto" : "Resolvido",
    ];
    const cells = isAllScope
      ? [
          csvSafe(alert.groupName ?? "Nao informado"),
          ...baseCells,
        ]
      : baseCells;
    return cells.join(",");
  });

  const csv = `\uFEFF${[header, ...rows].join("\n")}`;
  const filenameScope = isAllScope ? "all" : groupId ?? "group";
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="reachability-alerts-${filenameScope}-${month}-${window}.csv"`,
  });
  return new NextResponse(csv, { headers });
}

function csvSafe(value: string): string {
  if (!value) return "";
  const normalized = value.replace(/"/g, '""');
  if (normalized.includes(",") || normalized.includes('"')) {
    return `"${normalized}"`;
  }
  return normalized;
}

function formatExportDate(value: string | null): string {
  if (!value) return "";
  try {
    return formatInTimeZone(new Date(value), DEFAULT_TIMEZONE, "dd/MM/yyyy HH:mm:ss");
  } catch {
    return value;
  }
}

function formatExportWeekday(value: string | null): string {
  if (!value) return "";
  try {
    return formatInTimeZone(new Date(value), DEFAULT_TIMEZONE, "EEEE", {
      locale: ptBR,
    });
  } catch {
    return "";
  }
}
