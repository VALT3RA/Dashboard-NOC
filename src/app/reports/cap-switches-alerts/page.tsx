import type { ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Bolt, Clock3, Ticket, TimerReset } from "lucide-react";
import { buildGroupAlertReport } from "@/lib/group-alert-report";
import { formatMinutes } from "@/lib/time-format";
import { GroupAlertRecord } from "@/types/dashboard";
import {
  CAP_SWITCHES_GROUP_NAME,
  CAP_SWITCHES_RANGE_START,
  CAP_SWITCHES_RANGE_END,
} from "@/lib/cap-switches-report-config";
import { ExportDashboardButton } from "@/app/reports/cap-switches-alerts/export-dashboard-button";
import { DailyAlertsChart } from "@/app/reports/cap-switches-alerts/daily-alerts-chart";
import type {
  DailySeriesPoint,
  SeverityVisualConfig,
} from "@/app/reports/cap-switches-alerts/daily-alerts-types";

// Ajuste aqui as cores e ordem de cada criticidade (impacta barras, legendas e tooltip).
const SEVERITY_SCALE = [
  {
    level: 5,
    label: "Desastre",
    colorHex: "#e11d48",
  },
  {
    level: 4,
    label: "Alta",
    colorHex: "#f97316",
  },
  {
    level: 3,
    label: "Média",
    colorHex: "#fbbf24",
  },
  {
    level: 2,
    label: "Baixa",
    colorHex: "#0ea5e9",
  },
  {
    level: 1,
    label: "Informativo",
    colorHex: "#34d399",
  },
  {
    level: 0,
    label: "Nenhuma",
    colorHex: "#94a3b8",
  },
] as const satisfies ReadonlyArray<SeverityVisualConfig>;

export const dynamic = "force-dynamic";

export default async function CapSwitchesAlertsPage() {
  const report = await buildGroupAlertReport({
    groupName: CAP_SWITCHES_GROUP_NAME,
    start: CAP_SWITCHES_RANGE_START,
    end: CAP_SWITCHES_RANGE_END,
  });
  const summary = buildSummary(report.alerts);
  const timeline = buildDailySeries(
    report.alerts,
    CAP_SWITCHES_RANGE_START,
    CAP_SWITCHES_RANGE_END
  );
  const maxDailyTotal =
    timeline.length > 0
      ? Math.max(...timeline.map((item) => item.total))
      : 1;

  const metricCards = [
    {
      label: "Alertas no período",
      value: summary.total,
      accent: "from-slate-900 to-slate-700",
      subtitle: "Eventos registrados no intervalo",
      icon: <Activity className="h-8 w-8" />,
    },
    {
      label: "Chamados ITSM",
      value: summary.tickets,
      accent: "from-blue-600 to-blue-400",
      subtitle: `${summary.ticketRate}% dos alertas`,
      icon: <Ticket className="h-8 w-8" />,
    },
    {
      label: "Detecção média",
      value: summary.detection,
      unit: "min",
      accent: "from-emerald-600 to-emerald-400",
      subtitle: "Tempo até o 1º ACK",
      icon: <Clock3 className="h-8 w-8" />,
    },
    {
      label: "Resposta média",
      value: summary.response,
      unit: "min",
      accent: "from-amber-500 to-orange-400",
      subtitle: "Tempo até o 2º ACK",
      icon: <Bolt className="h-8 w-8" />,
    },
    {
      label: "Resolução média",
      value: summary.resolution,
      unit: "min",
      accent: "from-rose-600 to-rose-400",
      subtitle: "Até o encerramento",
      icon: <TimerReset className="h-8 w-8" />,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full space-y-8 px-4 sm:px-6 lg:px-16">
        <header className="flex flex-wrap items-start justify-between gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              Relatório Especial · Host Group
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Alertas do grupo {report.groupLabel}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Período:{" "}
              {format(CAP_SWITCHES_RANGE_START, "dd/MM/yyyy", { locale: ptBR })}{" "}
              até {format(CAP_SWITCHES_RANGE_END, "dd/MM/yyyy", { locale: ptBR })}
            </p>
            <p className="text-xs text-slate-500">
              Total identificado: {report.alerts.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ExportDashboardButton targetId="cap-switches-metrics" />
            <a
              href="/api/reports/cap-switches-alerts"
              className="rounded-2xl border border-blue-200 bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              target="_blank"
              rel="noreferrer"
            >
              Exportar CSV
            </a>
            <Link
              href="/reports/arprx001ctg-hosts"
              className="rounded-2xl border border-emerald-200 bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400"
            >
              Hosts via ARPRX001CTG
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </header>

        <div
          id="cap-switches-metrics"
          className="space-y-8 rounded-3xl bg-transparent"
        >
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {metricCards.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                  Dinâmica diária
                </p>
                <p className="text-sm text-slate-500">
                  Quantidade de alertas por dia no período analisado.
                </p>
              </div>
            </div>
            <div className="mt-6">
              {timeline.length ? (
                <DailyAlertsChart
                  data={timeline}
                  severityScale={SEVERITY_SCALE}
                  maxTotal={maxDailyTotal}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Nenhum alerta no período para gerar a série diária.
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-600">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">original_problem_id</th>
                  <th className="px-4 py-3 text-left">Alerta</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Hosts</th>
                  <th className="px-4 py-3 text-left">Abertura</th>
                  <th className="px-4 py-3 text-left">Fechamento</th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Data/hora do primeiro ACK registrado para o alerta."
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      1º ACK
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Data/hora do segundo ACK (ou do primeiro, caso não exista outro)."
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      2º ACK
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Tempo entre a abertura do alerta e o primeiro ACK registrado no Zabbix."
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      Detecção
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Tempo entre a abertura do alerta e o segundo ACK (ou o mesmo ACK caso só exista um)."
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      Resposta
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Tempo entre a abertura e o evento de recuperação (ou fim do período se o alerta ainda estiver aberto)."
                      className="cursor-help underline decoration-dotted underline-offset-4"
                    >
                      Resolução
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span
                      title="Chamado no ITSM só é aberto se o alerta permanecer aberto por mais de 5 minutos."
                      className="cursor-help underline underline-offset-4 decoration-dotted"
                    >
                      ITSM
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.alerts.map((alert) => (
                  <tr key={alert.eventId} className="bg-white">
                    <td className="px-4 py-3 font-mono text-sm text-slate-900">
                      {alert.eventId}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <span className="mr-3">{alert.name}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold ${
                          alert.severity === 5
                            ? "bg-rose-100 text-rose-700"
                            : alert.severity === 4
                              ? "bg-orange-100 text-orange-700"
                              : alert.severity === 3
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {alert.severityLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${alert.closedAt ? "bg-slate-100 text-slate-600" : "bg-rose-50 text-rose-700"}`}>
                        {alert.closedAt ? "Resolvido" : "Em aberto"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {alert.hosts.length
                          ? alert.hosts.map((host) => (
                              <div key={host.hostid} className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-900">
                                  {host.name}
                                </span>
                                <span
                                  className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                                    host.isActive
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-500"
                                  }`}
                                >
                                  {host.isActive ? "Ativo" : "Inativo"}
                                </span>
                              </div>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      <div className="font-semibold">
                        {format(
                          new Date(alert.openedAt),
                          "dd/MM/yyyy HH:mm:ss",
                          { locale: ptBR }
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {format(new Date(alert.openedAt), "EEEE", {
                          locale: ptBR,
                        })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {alert.closedAt
                        ? format(
                            new Date(alert.closedAt),
                            "dd/MM/yyyy HH:mm:ss",
                            { locale: ptBR }
                          )
                        : "Em aberto"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {alert.firstAckAt
                        ? format(
                            new Date(alert.firstAckAt),
                            "dd/MM/yyyy HH:mm:ss",
                            { locale: ptBR }
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {alert.secondAckAt
                        ? format(
                            new Date(alert.secondAckAt),
                            "dd/MM/yyyy HH:mm:ss",
                            { locale: ptBR }
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {formatMinutes(alert.detectionMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {formatMinutes(alert.responseMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      {formatMinutes(alert.resolutionMinutes)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          alert.ticketOpened
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {alert.ticketOpened ? "Sim" : "Não"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
type MetricCardProps = {
  label: string;
  value: number;
  unit?: string;
  subtitle?: string;
  accent: string;
  icon?: ReactNode;
};

function MetricCard({
  label,
  value,
  unit,
  subtitle,
  accent,
  icon,
}: MetricCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${accent} p-5 text-white shadow-xl`}
    >
      <div className="absolute inset-0 opacity-25 mix-blend-screen">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.6),_transparent_70%)]" />
      </div>
      <div className="relative flex items-start justify-between">
        <p className="text-base font-semibold uppercase tracking-[0.35em] text-white/90">
          {label}
        </p>
        {icon ? (
          <div className="rounded-2xl bg-white/20 p-2 text-white">{icon}</div>
        ) : null}
      </div>
      <div className="relative mt-3 text-[3.25rem] font-semibold leading-none">
        {Number.isFinite(value) ? value.toFixed(unit ? 1 : 0) : "—"}
        {unit ? (
          <span className="ml-2 align-middle text-xl font-medium">{unit}</span>
        ) : null}
      </div>
      {subtitle ? (
        <p className="relative mt-3 text-sm text-white/85">{subtitle}</p>
      ) : null}
    </div>
  );
}

function buildSummary(alerts: GroupAlertRecord[]) {
  const total = alerts.length;
  const detection = average(
    alerts.map((alert) => alert.detectionMinutes ?? undefined)
  );
  const response = average(
    alerts.map((alert) => alert.responseMinutes ?? undefined)
  );
  const resolution = average(alerts.map((alert) => alert.resolutionMinutes));
  const tickets = alerts.filter((alert) => alert.ticketOpened).length;
  const ticketRate = total ? ((tickets / total) * 100).toFixed(0) : "0";

  return {
    total,
    detection,
    response,
    resolution,
    tickets,
    ticketRate,
  };
}

function average(values: Array<number | undefined | null>) {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  if (!valid.length) return 0;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return sum / valid.length;
}

function buildDailySeries(
  alerts: GroupAlertRecord[],
  start: Date,
  end: Date
): DailySeriesPoint[] {
  const createBreakdown = () =>
    SEVERITY_SCALE.reduce<Record<number, number>>((acc, item) => {
      acc[item.level] = 0;
      return acc;
    }, {});

  const dayMap = new Map<string, DailySeriesPoint>();
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setUTCHours(0, 0, 0, 0);

  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    dayMap.set(key, { day: key, total: 0, breakdown: createBreakdown() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const alert of alerts) {
    const dayKey = alert.openedAt.slice(0, 10);
    const entry = dayMap.get(dayKey);
    if (!entry) continue;
    const severity = Number(alert.severity);
    const level = Number.isInteger(severity) ? severity : 0;
    entry.total += 1;
    entry.breakdown[level] = (entry.breakdown[level] ?? 0) + 1;
  }

  const series = Array.from(dayMap.values()).sort((a, b) =>
    a.day.localeCompare(b.day)
  );
  return series;
}




