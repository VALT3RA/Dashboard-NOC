import Link from "next/link";
import { format } from "date-fns";
import { buildReachabilityReport } from "@/lib/reachability-report";
import { getZabbixBaseUrl } from "@/lib/zabbix";
import { formatDurationMinutes } from "@/lib/time-format";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ReachabilityAlertsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolvedParams = await Promise.resolve(searchParams);
  const groupId = getFirst(resolvedParams?.groupId);
  const month =
    getFirst(resolvedParams?.month) ?? new Date().toISOString().slice(0, 7);
  const windowParam = getFirst(resolvedParams?.window);
  const window = windowParam === "overall" ? "overall" : "business";
  const page =
    clampNumber(getFirst(resolvedParams?.page), 1, 100000) ?? 1;
  const pageSize =
    clampNumber(getFirst(resolvedParams?.pageSize), 10, 200) ?? 50;

  if (!groupId) {
    return (
      <main className="min-h-screen bg-slate-100 py-10">
        <div className="mx-auto w-full space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
          <header className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 shadow-sm">
            <h1 className="text-2xl font-semibold text-slate-900">
              Relatorio de indisponibilidade (host)
            </h1>
            <p className="text-sm text-slate-500">
              Informe o host group para continuar.
            </p>
            <div className="mt-4">
              <Link
                href="/"
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
              >
                Voltar ao dashboard
              </Link>
            </div>
          </header>
        </div>
      </main>
    );
  }

  let report;
  try {
    report = await buildReachabilityReport({
      groupId,
      month,
      window,
      page,
      pageSize,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel carregar o relatorio.";
    return (
      <main className="min-h-screen bg-slate-100 py-10">
        <div className="mx-auto w-full space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
          <header className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-rose-700 shadow-sm">
            {message}
          </header>
          <Link
            href="/"
            className="inline-flex rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
          >
            Voltar ao dashboard
          </Link>
        </div>
      </main>
    );
  }

  const zabbixBaseUrl = getZabbixBaseUrl();
  const totalLabel =
    report.total === 1 ? "1 alerta" : `${report.total} alertas`;
  const pageNumbers = buildPageNumbers(report.page, report.pages);

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
        <header className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                Relatorio de indisponibilidade (host)
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">
                {report.groupLabel}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Periodo: {report.monthLabel} | Janela: {report.windowLabel}
              </p>
              <p className="text-xs text-slate-500">Total: {totalLabel}</p>
            </div>
            <Link
              href="/"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                Alertas de indisponibilidade
              </p>
              <p className="text-sm text-slate-500">
                Paginado por impacto na janela selecionada.
              </p>
            </div>
            <div className="text-sm font-semibold text-slate-600">
              Pagina {report.page} de {report.pages}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left">Alerta</th>
                  <th className="px-3 py-3 text-left">Tipo / Item</th>
                  <th className="px-3 py-3 text-left">Hosts</th>
                  <th className="px-3 py-3 text-left">Abertura</th>
                  <th className="px-3 py-3 text-left">Fechamento</th>
                  <th className="px-3 py-3 text-right">Downtime janela</th>
                  <th className="px-3 py-3 text-right">Downtime total</th>
                  <th className="px-3 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.alerts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      Nenhum alerta de indisponibilidade encontrado.
                    </td>
                  </tr>
                ) : (
                  report.alerts.map((alert) => {
                    const zabbixUrl = buildZabbixEventUrl(
                      zabbixBaseUrl,
                      alert.eventId,
                      alert.triggerId
                    );
                    return (
                      <tr key={alert.eventId} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 align-top">
                          <p className="font-semibold text-slate-900">
                            {alert.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {zabbixUrl ? (
                              <a
                                href={zabbixUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="font-semibold text-blue-600 hover:text-blue-700"
                                title="Abrir no Zabbix"
                              >
                                #{alert.eventId}
                              </a>
                            ) : (
                              <>#{alert.eventId}</>
                            )}{" "}
                            - {alert.severityLabel}
                          </p>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                            {alert.alertType}
                          </div>
                          <div className="text-xs text-slate-600">
                            {alert.itemKeys.length
                              ? alert.itemKeys.join(", ")
                              : "Nao informado"}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-xs text-slate-600">
                          {formatListPreview(alert.hostNames) || "Sem host"}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-800">
                          {formatAlertDate(alert.openedAt)}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-800">
                          {alert.closedAt
                            ? formatAlertDate(alert.closedAt)
                            : "Em aberto"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">
                          {formatDurationMinutes(alert.windowMinutes)}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700">
                          {formatDurationMinutes(alert.totalMinutes)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              alert.isOpen
                                ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                            }`}
                          >
                            {alert.isOpen ? "Em aberto" : "Resolvido"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {report.pages > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Link
                  href={buildPageHref({
                    groupId,
                    month,
                    window,
                    page: Math.max(1, report.page - 1),
                    pageSize: report.pageSize,
                  })}
                  className={`rounded-xl border px-4 py-2 font-semibold ${
                    report.page === 1
                      ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-200 bg-white text-slate-700 hover:text-slate-900"
                  }`}
                >
                  Anterior
                </Link>
                <Link
                  href={buildPageHref({
                    groupId,
                    month,
                    window,
                    page: Math.min(report.pages, report.page + 1),
                    pageSize: report.pageSize,
                  })}
                  className={`rounded-xl border px-4 py-2 font-semibold ${
                    report.page === report.pages
                      ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
                      : "border-slate-200 bg-white text-slate-700 hover:text-slate-900"
                  }`}
                >
                  Proxima
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {pageNumbers.map((number) => (
                  <Link
                    key={number}
                    href={buildPageHref({
                      groupId,
                      month,
                      window,
                      page: number,
                      pageSize: report.pageSize,
                    })}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                      number === report.page
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-700 hover:text-slate-900"
                    }`}
                  >
                    {number}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function getFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function clampNumber(
  value: string | undefined,
  min: number,
  max: number
): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}

function buildPageNumbers(page: number, total: number): number[] {
  if (total <= 1) return [1];
  const window = 2;
  const start = Math.max(1, page - window);
  const end = Math.min(total, start + window * 2);
  const adjustedStart = Math.max(1, end - window * 2);
  return Array.from(
    { length: end - adjustedStart + 1 },
    (_, index) => adjustedStart + index
  );
}

function buildPageHref(params: {
  groupId: string;
  month: string;
  window: "business" | "overall";
  page: number;
  pageSize: number;
}) {
  const search = new URLSearchParams();
  search.set("groupId", params.groupId);
  search.set("month", params.month);
  search.set("window", params.window);
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));
  return `/reports/reachability-alerts?${search.toString()}`;
}

function formatAlertDate(value: string) {
  try {
    return format(new Date(value), "dd/MM/yyyy HH:mm");
  } catch {
    return "-";
  }
}

function formatListPreview(values: string[]) {
  if (!values.length) return "";
  if (values.length <= 2) {
    return values.join(", ");
  }
  const [first, second] = values;
  const remaining = values.length - 2;
  return `${first}, ${second} +${remaining}`;
}

function buildZabbixEventUrl(
  baseUrl: string | null | undefined,
  eventId: string,
  triggerId?: string
) {
  if (!baseUrl || !eventId) return null;
  const normalized = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (triggerId) {
    params.set("triggerid", triggerId);
  }
  params.set("eventid", eventId);
  return `${normalized}/tr_events.php?${params.toString()}`;
}
