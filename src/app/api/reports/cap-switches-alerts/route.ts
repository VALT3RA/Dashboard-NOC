import { NextResponse } from "next/server";
import { buildGroupAlertReport } from "@/lib/group-alert-report";
import {
  CAP_SWITCHES_GROUP_NAME,
  CAP_SWITCHES_RANGE_END,
  CAP_SWITCHES_RANGE_START,
} from "@/lib/cap-switches-report-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await buildGroupAlertReport({
    groupName: CAP_SWITCHES_GROUP_NAME,
    start: CAP_SWITCHES_RANGE_START,
    end: CAP_SWITCHES_RANGE_END,
  });

  const header =
    "original_problem_id,alerta,severidade,hosts,abertura,fechamento,detecao_min,resposta_min,resolucao_min,primeiro_ack,segundo_ack,tempo_segundo_ack_min,ticket_itsm";
  const rows = report.alerts.map((alert) => {
    const hosts = alert.hosts.map((host) => host.name).join(" | ");
    const cells = [
      alert.eventId,
      csvSafe(alert.name),
      alert.severityLabel,
      csvSafe(hosts),
      alert.openedAt,
      alert.closedAt ?? "",
      alert.detectionMinutes ?? "",
      alert.responseMinutes ?? "",
      alert.resolutionMinutes,
      alert.firstAckAt ?? "",
      alert.secondAckAt ?? "",
      alert.secondAckMinutes ?? "",
      alert.ticketOpened ? "SIM" : "NAO",
    ];
    return cells.join(",");
  });

  const csv = [header, ...rows].join("\n");
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="cap-switches-alerts.csv"`,
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
