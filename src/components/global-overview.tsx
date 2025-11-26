"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import {
  OpenProblemDetail,
  CriticalAlertHighlight,
  DashboardMetrics,
  GroupMetricsApiResponse,
  HostGroupMetric,
  HostGroupOption,
  SeveritySummary,
} from "@/types/dashboard";
import { SeverityTable } from "@/components/severity-table";
import { sumContractedHostsByName } from "@/lib/contracted-hosts";

const MONTH_OPTIONS = buildMonthOptions(12);
const SORT_FIELDS: Array<{ label: string; value: GroupSortField }> = [
  { label: "Nome", value: "name" },
  { label: "Alertas", value: "alerts" },
  { label: "Alertas em aberto", value: "openAlerts" },
  { label: "Tempo de resposta (1o ACK)", value: "detection" },
  { label: "Resolucao", value: "resolution" },
  { label: "Disponibilidade", value: "availability" },
  { label: "Disponibilidade (7h-23:59)", value: "availabilityBusiness" },
];
const HOST_SORT_FIELDS: Array<{ label: string; value: HostSortField }> = [
  { label: "Nome", value: "name" },
  { label: "Alertas", value: "alerts" },
  { label: "Alertas em aberto", value: "openAlerts" },
  { label: "Tempo de resposta (1o ACK)", value: "detection" },
  { label: "Resolucao", value: "resolution" },
  { label: "Disponibilidade", value: "availability" },
  { label: "Disponibilidade (7h-23:59)", value: "availabilityBusiness" },
];

type OverviewCardSource = {
  alerts: number;
  openAlerts: number;
  hosts: number;
  inactiveHosts: number;
  detection: number;
  resolution: number;
  availability: number;
  businessAvailability: number;
  contractedHosts: number | null;
};

const EMPTY_SOURCE: OverviewCardSource = {
  alerts: 0,
  openAlerts: 0,
  hosts: 0,
  inactiveHosts: 0,
  detection: 0,
  resolution: 0,
  availability: 0,
  businessAvailability: 0,
  contractedHosts: null,
};

const FILTER_LABEL_CLASS = "flex flex-col text-xs font-semibold text-slate-600";
const FILTER_SELECT_CLASS =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
const DROPDOWN_INPUT_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

export function GlobalOverview() {
  const [month, setMonth] = useState(MONTH_OPTIONS[0]?.value ?? "");
  const [hostGroups, setHostGroups] = useState<HostGroupOption[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [groupData, setGroupData] = useState<GroupMetricsApiResponse | null>(
    null
  );
  const [singleGroupData, setSingleGroupData] =
    useState<DashboardMetrics | null>(null);
  const [comparisonGroupData, setComparisonGroupData] =
    useState<GroupMetricsApiResponse | null>(null);
  const [singleComparisonData, setSingleComparisonData] =
    useState<DashboardMetrics | null>(null);
  const [sortField, setSortField] = useState<GroupSortField>("name");
  const [hostSortField, setHostSortField] = useState<HostSortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [groupLoading, setGroupLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/host-groups")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Não foi possível carregar os host groups.");
        }
        const payload = (await response.json()) as {
          groups: HostGroupOption[];
        };
        setHostGroups(
          payload.groups.filter((group) => {
            const name = group.name.toLowerCase();
            return (
              !name.includes("templates") &&
              !name.startsWith("test") &&
              name !== "discovered hosts"
            );
          })
        );
      })
      .catch((err) => {
        setGroupError(
          err instanceof Error
            ? err.message
            : "Falha ao carregar lista de host groups."
        );
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadGroupMetrics() {
      setGroupLoading(true);
      setGroupError(null);

      try {
        const groupIdsParam = selectedGroups.length
          ? `&groupIds=${selectedGroups.join(",")}`
          : "";
        const response = await fetch(
          `/api/group-metrics?month=${month}${groupIdsParam}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        if (!active) return;
        const payload = (await response.json()) as GroupMetricsApiResponse;
        setGroupData(payload);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setGroupError(
          err instanceof Error ? err.message : "Falha ao carregar dados."
        );
        setGroupData(null);
      } finally {
        if (active && !controller.signal.aborted) {
          setGroupLoading(false);
        }
      }
    }

    loadGroupMetrics();

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, selectedGroups]);

  useEffect(() => {
    const previousMonth = getPreviousMonthValue(month);
    if (!previousMonth) {
      setComparisonGroupData(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadComparisonGroupMetrics() {
      const groupIdsParam = selectedGroups.length
        ? `&groupIds=${selectedGroups.join(",")}`
        : "";
      try {
        const response = await fetch(
          `/api/group-metrics?month=${previousMonth}${groupIdsParam}`,
          {
            signal: controller.signal,
          }
        );
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        if (!active) return;
        const payload = (await response.json()) as GroupMetricsApiResponse;
        setComparisonGroupData(payload);
      } catch {
        if (!active || controller.signal.aborted) return;
        setComparisonGroupData(null);
      }
    }

    loadComparisonGroupMetrics();

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, selectedGroups]);

  useEffect(() => {
    if (selectedGroups.length !== 1) {
      setSingleGroupData(null);
      setSingleError(null);
      setSingleLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const groupId = selectedGroups[0];

    async function loadSingleGroupMetrics() {
      setSingleLoading(true);
      setSingleError(null);

      try {
        const response = await fetch(
          `/api/metrics?month=${month}&groupId=${groupId}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        if (!active) return;
        const payload = (await response.json()) as {
          metrics: DashboardMetrics;
        };
        setSingleGroupData(payload.metrics);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        setSingleError(
          err instanceof Error ? err.message : "Falha ao carregar dados."
        );
        setSingleGroupData(null);
      } finally {
        if (active && !controller.signal.aborted) {
          setSingleLoading(false);
        }
      }
    }

    loadSingleGroupMetrics();

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, selectedGroups]);

  useEffect(() => {
    if (selectedGroups.length !== 1) {
      setSingleComparisonData(null);
      return;
    }
    const previousMonth = getPreviousMonthValue(month);
    if (!previousMonth) {
      setSingleComparisonData(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const groupId = selectedGroups[0];

    async function loadSingleComparisonMetrics() {
      try {
        const response = await fetch(
          `/api/metrics?month=${previousMonth}&groupId=${groupId}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        if (!active) return;
        const payload = (await response.json()) as {
          metrics: DashboardMetrics;
        };
        setSingleComparisonData(payload.metrics);
      } catch {
        if (!active || controller.signal.aborted) return;
        setSingleComparisonData(null);
      }
    }

    loadSingleComparisonMetrics();

    return () => {
      active = false;
      controller.abort();
    };
  }, [month, selectedGroups]);
  const selectedGroupOptions = useMemo(
    () =>
      selectedGroups
        .map((id) => hostGroups.find((group) => group.groupid === id))
        .filter((group): group is HostGroupOption => Boolean(group)),
    [hostGroups, selectedGroups]
  );
  const selectedGroupNames = selectedGroupOptions.map((group) => group.name);

  const filteredGroups = useMemo(() => {
    if (!groupData) return [];
    const selectedSet = new Set(selectedGroups);
    let base = groupData.groups;
    if (selectedSet.size) {
      base = base.filter((group) => selectedSet.has(group.groupid));
    }
    return [...base].sort((a, b) =>
      compareGroupMetrics(a, b, sortField, sortOrder)
    );
  }, [groupData, selectedGroups, sortField, sortOrder]);

  const filteredHosts = useMemo(() => {
    if (!singleGroupData) return [];
    return [...singleGroupData.hosts].sort((a, b) =>
      compareHostMetrics(a, b, hostSortField, sortOrder)
    );
  }, [singleGroupData, hostSortField, sortOrder]);

  const isSingleGroupSelection = selectedGroups.length === 1;
  const isSingleGroupMode = isSingleGroupSelection && Boolean(singleGroupData);

  const filteredSummary = useMemo(
    () =>
      buildFilteredSummary({
        groupData,
        selectedGroups,
        skipSelectedSummary: isSingleGroupMode,
      }),
    [groupData, selectedGroups, isSingleGroupMode]
  );

  const filteredComparisonSummary = useMemo(
    () =>
      buildFilteredSummary({
        groupData: comparisonGroupData,
        selectedGroups,
        skipSelectedSummary:
          isSingleGroupSelection && Boolean(singleComparisonData),
      }),
    [
      comparisonGroupData,
      selectedGroups,
      isSingleGroupSelection,
      singleComparisonData,
    ]
  );

  const summarySource = convertSummaryToSource(filteredSummary);

  const totalsSource = convertTotalsToSource(groupData);

  const singleSource = convertSingleToSource(singleGroupData);

  const cardSource = isSingleGroupMode

    ? singleSource ?? summarySource ?? totalsSource ?? EMPTY_SOURCE

    : summarySource ?? totalsSource ?? EMPTY_SOURCE;



  const comparisonSummarySource = convertSummaryToSource(

    filteredComparisonSummary

  );

  const comparisonTotalsSource = convertTotalsToSource(comparisonGroupData);

  const comparisonSingleSource = convertSingleToSource(singleComparisonData);

  const comparisonCardSource = isSingleGroupMode

    ? comparisonSingleSource ??

      comparisonSummarySource ??

      comparisonTotalsSource ??

      null

    : comparisonSummarySource ?? comparisonTotalsSource ?? null;

  const contractedHosts = sumContractedHostsByName(selectedGroupNames);
  const adjustedCardSource: OverviewCardSource = {
    ...(cardSource ?? EMPTY_SOURCE),
    contractedHosts,
  };
  const adjustedComparisonCardSource = comparisonCardSource
    ? {
        ...comparisonCardSource,
        contractedHosts,
      }
    : null;



  const severitySummaryData = isSingleGroupMode
    ? singleGroupData?.severitySummary ?? null
    : filteredSummary?.severitySummary ??
      groupData?.severitySummary ??
      null;

  const severityContext = useMemo(() => {
    const periodRange = buildPeriodRangeLabel(month);
    const metaPeriod = groupData?.meta.period ?? singleGroupData?.meta.period;
    const periodLabel = periodRange
      ? `Período: ${periodRange}`
      : metaPeriod
      ? `Período: ${metaPeriod}`
      : null;

    let clientLabel: string | null = null;
    if (selectedGroupNames.length === 1) {
      clientLabel = `Cliente: ${selectedGroupNames[0]}`;
    } else if (selectedGroupNames.length > 1) {
      clientLabel = `${selectedGroupNames.length} clientes selecionados`;
    }

    if (!clientLabel && !periodLabel) {
      return undefined;
    }

    return {
      client: clientLabel,
      period: periodLabel,
    };
  }, [
    groupData?.meta.period,
    month,
    selectedGroupNames,
    singleGroupData?.meta.period,
  ]);

  const singleHighlights = singleGroupData?.criticalAlerts;
  const groupHighlights = groupData?.criticalAlerts;
  const disasterAlerts = useMemo(() => {
    const source = isSingleGroupMode
      ? singleHighlights ?? []
      : groupHighlights ?? [];
    if (!source.length) {
      return [];
    }
    const filtered = filterCriticalAlerts({
      alerts: source,
      selectedGroups,
      applyFilters: !isSingleGroupMode,
    });
    return sortCriticalAlerts(filtered);
  }, [
    groupHighlights,
    isSingleGroupMode,
    selectedGroups,
    singleHighlights,
  ]);

  const loading = isSingleGroupMode ? singleLoading : groupLoading;
  const error = singleError ?? groupError;

  const overviewTitle = isSingleGroupMode
    ? selectedGroupNames[0] ?? "Host group"
    : selectedGroupNames.length > 1
    ? `${selectedGroupNames.length} host groups selecionados`
    : "Todos os clientes";

  return (
    <section className="space-y-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <header className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              Contego Security ?? Visuo Geral
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
                Indicadores Globais de Host Groups
              </h1>
              <p className="text-sm text-slate-500">
                Alertas, tempos m?dios e disponibilidade por cliente/host group.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reports/cap-switches-alerts"
              className="inline-flex items-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
            >
              Relat�rio CAP Switches
            </Link>
            <Link
              href="/open-problems"
              className="inline-flex items-center rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500"
            >
              Ver problemas em aberto
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm ring-1 ring-white/60">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-nowrap lg:items-end">
            <label className={`${FILTER_LABEL_CLASS} lg:flex-1`}>
              Mês analisado
              <select
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className={FILTER_SELECT_CLASS}
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={`${FILTER_LABEL_CLASS} lg:flex-[2]`}>
              Host groups
              <div className="mt-2">
                <HostGroupMultiSelect
                  options={hostGroups}
                  selectedOptions={selectedGroupOptions}
                  selectedIds={selectedGroups}
                  onChange={setSelectedGroups}
                />
              </div>
            </div>
            <label className={`${FILTER_LABEL_CLASS} lg:flex-1`}>
              Ordenar por
              <select
                value={isSingleGroupMode ? hostSortField : sortField}
                onChange={(event) =>
                  isSingleGroupMode
                    ? setHostSortField(event.target.value as HostSortField)
                    : setSortField(event.target.value as GroupSortField)
                }
                className={FILTER_SELECT_CLASS}
              >
                {(isSingleGroupMode ? HOST_SORT_FIELDS : SORT_FIELDS).map(
                  (option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className={`${FILTER_LABEL_CLASS} lg:flex-[0.7]`}>
              Ordem
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                className={FILTER_SELECT_CLASS}
              >
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </select>
            </label>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {(groupData || singleGroupData) && (
          <>
            <span className="rounded-2xl bg-slate-100 px-4 py-2">
              Período:{" "}
              <strong className="text-slate-700">
                {groupData?.meta.period ??
                  singleGroupData?.meta.period ??
                  ""}
              </strong>
            </span>
            <span className="rounded-2xl bg-slate-100 px-4 py-2">
              Atualizado em:{" "}
              <strong className="text-slate-700">
                {format(
                  new Date(
                    groupData?.meta.generatedAt ??
                      singleGroupData?.meta.generatedAt ??
                      new Date().toISOString()
                  ),
                  "dd/MM/yyyy HH:mm"
                )}
              </strong>
            </span>
            {selectedGroupNames.length > 0 && (
              <span className="rounded-2xl bg-blue-50 px-4 py-2 text-blue-700">
                {selectedGroupNames.length === 1
                  ? `Host group selecionado: ${selectedGroupNames[0]}`
                  : `${selectedGroupNames.length} host groups selecionados`}
              </span>
            )}
          </>
        )}
      </div>

      <DisasterAlertHighlights alerts={disasterAlerts} loading={loading} />

      <OverviewCards
        loading={loading}
        source={adjustedCardSource}
        comparison={adjustedComparisonCardSource}
        title={overviewTitle}
        month={month}
        selectedGroups={selectedGroups}
        selectedGroupNames={selectedGroupNames}
      />

      <SeverityTable summary={severitySummaryData} context={severityContext} />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}

      {isSingleGroupSelection ? (
        <HostTable rows={filteredHosts} loading={loading} />
      ) : (
        <GroupTable rows={filteredGroups} loading={loading} />
      )}
    </section>
  );
}

function DisasterAlertHighlights({
  alerts,
  loading,
}: {
  alerts: CriticalAlertHighlight[];
  loading: boolean;
}) {
  const totalLabel =
    alerts.length === 1
      ? "1 alerta disaster"
      : `${alerts.length} alertas disaster`;

  return (
    <section className="space-y-4 rounded-3xl border border-amber-100 bg-white/95 p-5 shadow-sm ring-1 ring-amber-100/60">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            Alertas Disaster
          </p>
          <p className="text-sm text-slate-500">
            Lista priorizada dos alertas mais críticos do período, com foco nos
            que seguem em aberto.
          </p>
        </div>
        <span className="rounded-2xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
          {totalLabel}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-2xl bg-amber-100/70"
            />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl bg-amber-50/80 px-4 py-6 text-sm font-semibold text-amber-700">
          Nenhum alerta disaster registrado no período selecionado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Alerta / Hosts</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Abertura</th>
                  <th className="px-4 py-3">Encerramento</th>
                  <th className="px-4 py-3 text-right">
                    Tempo de resposta (1o ACK)
                  </th>
                  <th className="px-4 py-3 text-right">Resolução (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {alerts.map((alert) => (
                  <tr key={alert.eventId} className="bg-white/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">
                        {alert.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatListPreview(alert.hostNames) ||
                          "Hosts indisponíveis"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-2xl px-3 py-1 text-xs font-semibold ${
                          alert.isOpen
                            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        }`}
                      >
                        {alert.isOpen ? "Em aberto" : "Resolvido"}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatListPreview(alert.groupNames) || "Sem grupo"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                      {formatAlertDate(alert.openedAt)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">
                      {alert.isOpen ? "—" : formatAlertDate(alert.closedAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-base font-semibold text-slate-900">
                      {formatMinutesOrDash(alert.detectionMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right text-base font-semibold text-slate-900">
                      {formatMinutesOrDash(alert.resolutionMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

type KpiSectionKey = "service" | "infrastructure" | "alerts" | "operations";

type CardDefinition = {
  id: keyof OverviewCardSource;
  section: KpiSectionKey;
  title: string;
  labelBuilder?: (context: { filterTitle: string }) => string;
  unit: "percent" | "minutes" | "number";
  target?: number;
  warnMargin?: number;
  betterDirection?: "higher" | "lower";
  description?: string;
};

const SECTION_LAYOUTS: Record<KpiSectionKey, { title: string; grid: string }> = {
  service: {
    title: "Destaques do serviço",
    grid: "grid-cols-1 gap-4 lg:grid-cols-2",
  },
  infrastructure: {
    title: "Saúde da infraestrutura",
    grid: "grid-cols-1 gap-4 lg:grid-cols-2",
  },
  alerts: {
    title: "Fluxo de alertas",
    grid: "grid-cols-1 gap-4 lg:grid-cols-2",
  },
  operations: {
    title: "Performance operacional",
    grid: "grid-cols-1 gap-4 md:grid-cols-2",
  },
};

const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: "availability",
    section: "service",
    title: "Disponibilidade geral",
    unit: "percent",
    target: 99.5,
    warnMargin: 0.3,
    betterDirection: "higher",
  },
  {
    id: "businessAvailability",
    section: "service",
    title: "Disponibilidade (7h–23:59)",
    unit: "percent",
    target: 99.0,
    warnMargin: 0.5,
    betterDirection: "higher",
  },
  {
    id: "hosts",
    section: "infrastructure",
    title: "Hosts monitorados",
    unit: "number",
    betterDirection: "higher",
    description: "Inventário ativo monitorado",
  },
  {
    id: "inactiveHosts",
    section: "infrastructure",
    title: "Hosts inativos",
    unit: "number",
    target: 0,
    warnMargin: 1,
    betterDirection: "lower",
    description: "Ativos com falha ou manutenção",
  },
  {
    id: "alerts",
    section: "alerts",
    title: "Alertas",
    labelBuilder: ({ filterTitle }) => `Alertas (${filterTitle})`,
    unit: "number",
    betterDirection: "lower",
    description: "Baseado no filtro atual",
  },
  {
    id: "openAlerts",
    section: "alerts",
    title: "Alertas em aberto",
    unit: "number",
    betterDirection: "lower",
    description: "Necessitam acompanhamento",
  },
  {
    id: "detection",
    section: "operations",
    title: "Tempo medio de resposta (1o ACK)",
    unit: "minutes",
    target: 5,
    warnMargin: 2,
    betterDirection: "lower",
    description: "Minutos (media dos ultimos 30 dias)",
  },
  {
    id: "resolution",
    section: "operations",
    title: "Tempo medio de resolucao",
    unit: "minutes",
    target: 60,
    warnMargin: 15,
    betterDirection: "lower",
    description: "Minutos (media dos ultimos 30 dias)",
  },
];

type StatusTone = "success" | "warning" | "danger" | "neutral";

const BADGE_STYLES: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-rose-50 text-rose-700 border border-rose-200",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
};

type OpenAlertsModalProps = {
  open: boolean;
  onClose: () => void;
  problems: OpenProblemDetail[];
  loading: boolean;
  error: string | null;
  scopeLabel: string;
};

function OpenAlertsModal({
  open,
  onClose,
  problems,
  loading,
  error,
  scopeLabel,
}: OpenAlertsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              Alertas em aberto
            </p>
            <p className="text-sm text-slate-500">Escopo: {scopeLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            Fechar
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-slate-500">Carregando alertas...</p>
          ) : error ? (
            <p className="text-sm text-rose-600">{error}</p>
          ) : problems.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhum alerta em aberto para o escopo atual.
            </p>
          ) : (
            <div className="space-y-4">
              {problems.map((problem) => (
                <div
                  key={problem.eventId}
                  className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-semibold text-slate-900">
                      {problem.name}
                    </p>
                    <span className="text-xs font-semibold text-slate-500">
                      #{problem.eventId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Hosts:{" "}
                    {problem.hosts.map((host) => host.name).join(", ") || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Grupos: {problem.groupNames.join(", ") || "—"}
                  </p>
                  <div className="mt-2 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-400">
                        Abertura
                      </p>
                      <p className="font-semibold text-slate-900">
                        {format(new Date(problem.openedAt), "dd/MM HH:mm")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-400">
                        Tempo aberto
                      </p>
                      <p className="font-semibold text-slate-900">
                        {formatDuration(problem.durationMinutes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-400">
                        Criticidade
                      </p>
                      <p className="font-semibold text-slate-900">
                        {problem.severityLabel}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OverviewCards({
  loading,
  source,
  comparison,
  title,
  month,
  selectedGroups,
  selectedGroupNames,
}: {
  loading: boolean;
  source: OverviewCardSource;
  comparison: OverviewCardSource | null;
  title: string;
  month: string;
  selectedGroups: string[];
  selectedGroupNames: string[];
}) {
  const [showOpenAlerts, setShowOpenAlerts] = useState(false);
  const [openAlerts, setOpenAlerts] = useState<OpenProblemDetail[] | null>(null);
  const [openAlertsLoading, setOpenAlertsLoading] = useState(false);
  const [openAlertsError, setOpenAlertsError] = useState<string | null>(null);

  const sections = (Object.keys(SECTION_LAYOUTS) as KpiSectionKey[]).map((key) => ({
    key,
    ...SECTION_LAYOUTS[key],
    cards: CARD_DEFINITIONS.filter((definition) => definition.section === key),
  }));

  const filteredOpenAlerts = useMemo(() => {
    if (!openAlerts) return [];
    if (!selectedGroupNames.length) return openAlerts;
    const normalized = selectedGroupNames.map((name) => name.toLowerCase());
    return openAlerts.filter((problem) =>
      problem.groupNames.some((group) =>
        normalized.includes(group.toLowerCase())
      )
    );
  }, [openAlerts, selectedGroupNames]);

  const handleOpenAlertsClick = () => {
    setShowOpenAlerts(true);
    if (openAlerts || openAlertsLoading) return;
    setOpenAlertsLoading(true);
    setOpenAlertsError(null);
    fetch("/api/open-problems")
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? response.statusText);
        }
        const data = (await response.json()) as {
          problems: OpenProblemDetail[];
        };
        setOpenAlerts(data.problems);
      })
      .catch((error) => {
        setOpenAlertsError(
          error instanceof Error
            ? error.message
            : "Falha ao carregar alertas em aberto."
        );
      })
      .finally(() => {
        setOpenAlertsLoading(false);
      });
  };

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.key} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
            {section.title}
          </p>
          <div className={`grid ${section.grid}`}>
            {section.cards.map((definition) => {
              const label = definition.labelBuilder
                ? definition.labelBuilder({ filterTitle: title })
                : definition.title;
              const value = source[definition.id];
              const previousValue = comparison?.[definition.id] ?? null;
              const formattedValue = formatPrimaryValue(definition, value);
              const subtitle = buildCardSubtitle(definition, previousValue);
              const status = buildCardStatus(definition, value, previousValue);
              const trend = buildTrendText(definition, value, previousValue);
              const isOpenAlertsCard = definition.id === "openAlerts";
              const contracted =
                definition.id === "hosts" ? source.contractedHosts : null;
              let contractedBadge: JSX.Element | null = null;
              if (
                definition.id === "hosts" &&
                contracted !== null &&
                Number.isFinite(contracted)
              ) {
                const delta = source.hosts - contracted;
                const labelStatus =
                  delta < 0
                    ? "Abaixo do contratado"
                    : delta === 0
                    ? "Dentro do contratado"
                    : "Acima do contratado";
                const badgeClass =
                  delta < 0
                    ? BADGE_STYLES.danger
                    : delta === 0
                    ? BADGE_STYLES.success
                    : BADGE_STYLES.warning;
                contractedBadge = (
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClass}`}
                  >
                    {labelStatus} ({source.hosts.toLocaleString("pt-BR")}/
                    {contracted.toLocaleString("pt-BR")})
                  </span>
                );
              }
              const cardContent = (
                <div
                  key={definition.id}
                  className={`rounded-3xl border border-slate-100 bg-white/95 p-5 shadow-sm ring-1 ring-slate-100 ${
                    loading ? "opacity-60" : ""
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    {label}
                  </p>
                  <div className="mt-3 text-5xl font-semibold text-slate-900">
                    {loading ? "..." : formattedValue}
                  </div>
                  {subtitle && (
                    <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    {status && (
                      <span
                        className={`inline-flex rounded-full px-3 py-1 ${BADGE_STYLES[status.tone]}`}
                      >
                        {status.label}
                      </span>
                    )}
                    {trend && (
                      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                        {trend}
                      </span>
                    )}
                    {contractedBadge}
                  </div>
                  {definition.id === "resolution" && (
                    <div className="mt-4">
                      <Link
                        href={`/reports/slow-resolutions?month=${month}${
                          selectedGroups.length
                            ? `&groupIds=${selectedGroups.join(",")}`
                            : ""
                        }`}
                        className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Ver alertas com maior tempo de resolução
                      </Link>
                    </div>
                  )}
                </div>
              );

              return isOpenAlertsCard ? (
                <button
                  key={definition.id}
                  type="button"
                  onClick={handleOpenAlertsClick}
                  className="text-left"
                >
                  {cardContent}
                </button>
              ) : (
                cardContent
              );
            })}
          </div>
        </div>
      ))}
      <OpenAlertsModal
        open={showOpenAlerts}
        onClose={() => setShowOpenAlerts(false)}
        problems={filteredOpenAlerts}
        loading={openAlertsLoading}
        error={openAlertsError}
        scopeLabel={
          selectedGroupNames.length
            ? selectedGroupNames.join(", ")
            : "Todos os clientes"
        }
      />
    </div>
  );
}


function GroupTable({
  rows,
  loading,
}: {
  rows: HostGroupMetric[];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Host group</th>
            <th className="px-4 py-3 text-right font-semibold">Hosts</th>
            <th className="px-4 py-3 text-right font-semibold">Inativos</th>
            <th className="px-4 py-3 text-right font-semibold">Alertas</th>
            <th className="px-4 py-3 text-right font-semibold">
              Alertas em aberto
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Tempo de resposta (1o ACK)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Resolução (min)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Disponibilidade (%)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Disponibilidade (7h-23:59)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
          {loading && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                Carregando métricas...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                Nenhum host group encontrado.
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((group) => (
              <tr key={group.groupid}>
                <td className="px-4 py-3 font-semibold">{group.name}</td>
                <td className="px-4 py-3 text-right">{group.hosts}</td>
                <td className="px-4 py-3 text-right">{group.inactiveHosts}</td>
                <td className="px-4 py-3 text-right">{group.alerts}</td>
                <td className="px-4 py-3 text-right">{group.openAlerts}</td>
                <td className="px-4 py-3 text-right">
                  {formatMinutes(group.detectionMinutes)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatMinutes(group.resolutionMinutes)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    group.availabilityPct < 99
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {group.availabilityPct.toFixed(2)}%
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    group.businessAvailabilityPct < 99
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {group.businessAvailabilityPct.toFixed(2)}%
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function HostTable({
  rows,
  loading,
}: {
  rows: DashboardMetrics["hosts"];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Host</th>
            <th className="px-4 py-3 text-right font-semibold">Alertas</th>
            <th className="px-4 py-3 text-right font-semibold">
              Alertas em aberto
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Tempo de resposta (1o ACK)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Resolução (min)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Disponibilidade (%)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Disponibilidade (7h-23:59)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-slate-800">
          {loading && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                Carregando métricas...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                Nenhum host encontrado.
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((host) => (
              <tr key={host.hostid}>
                <td className="px-4 py-3 font-semibold">{host.name}</td>
                <td className="px-4 py-3 text-right">{host.eventCount}</td>
                <td className="px-4 py-3 text-right">{host.openEventCount}</td>
                <td className="px-4 py-3 text-right">
                  {formatMinutes(host.detectionMinutes)}
                </td>
                <td className="px-4 py-3 text-right">
                  {formatMinutes(host.resolutionMinutes)}
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    host.availabilityPct < 99
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {host.availabilityPct.toFixed(2)}%
                </td>
                <td
                  className={`px-4 py-3 text-right ${
                    host.businessAvailabilityPct < 99
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {host.businessAvailabilityPct.toFixed(2)}%
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

type HostGroupMultiSelectProps = {
  options: HostGroupOption[];
  selectedOptions: HostGroupOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

type OverviewSummary = OverviewCardSource & {
  severitySummary: SeveritySummary[] | null;
};

function buildFilteredSummary({
  groupData,
  selectedGroups,
  skipSelectedSummary,
}: {
  groupData: GroupMetricsApiResponse | null;
  selectedGroups: string[];
  skipSelectedSummary?: boolean;
}): OverviewSummary | null {
  if (!groupData) return null;
  const selectedSet = new Set(selectedGroups);
  if (!selectedSet.size) {
    return null;
  }

  const groups = groupData.groups.filter((group) =>
    selectedSet.has(group.groupid)
  );
  if (!groups.length) {
    return null;
  }
  if (selectedSet.size === 1 && skipSelectedSummary) {
    return null;
  }

  return summarizeHostGroupMetrics(groups);
}

function summarizeHostGroupMetrics(
  groups: HostGroupMetric[]
): OverviewSummary | null {
  if (!groups.length) return null;

  const activeUnion = new Set<string>();
  const inactiveUnion = new Set<string>();
  const alertUnion = new Set<string>();
  const openAlertUnion = new Set<string>();

  groups.forEach((group) => {
    group.hostIds.forEach((id) => activeUnion.add(id));
    group.inactiveHostIds?.forEach((id) => inactiveUnion.add(id));
    group.eventIds?.forEach((id) => alertUnion.add(id));
    group.openEventIds?.forEach((id) => openAlertUnion.add(id));
  });

  const sumAlerts =
    alertUnion.size ||
    groups.reduce((acc, group) => acc + (group.alerts || 0), 0);
  const sumOpenAlerts =
    openAlertUnion.size ||
    groups.reduce((acc, group) => acc + (group.openAlerts || 0), 0);

  const detectionWeight = groups.reduce(
    (acc, group) => acc + (group.alerts || 0),
    0
  );
  const availabilityWeight = groups.reduce(
    (acc, group) => acc + (group.hosts || 0),
    0
  );

  const detection =
    detectionWeight > 0
      ? groups.reduce(
          (acc, group) =>
            acc + (group.detectionMinutes || 0) * (group.alerts || 0),
          0
        ) / detectionWeight
      : 0;
  const resolution =
    detectionWeight > 0
      ? groups.reduce(
          (acc, group) =>
            acc + (group.resolutionMinutes || 0) * (group.alerts || 0),
          0
        ) / detectionWeight
      : 0;
  const availability =
    availabilityWeight > 0
      ? groups.reduce(
          (acc, group) =>
            acc + (group.availabilityPct || 0) * (group.hosts || 0),
          0
        ) / availabilityWeight
      : 0;
  const businessAvailability =
    availabilityWeight > 0
      ? groups.reduce(
          (acc, group) =>
            acc +
            (group.businessAvailabilityPct || 0) * (group.hosts || 0),
          0
        ) / availabilityWeight
      : 0;

  return {
    alerts: sumAlerts,
    openAlerts: sumOpenAlerts,
    hosts: activeUnion.size,
    inactiveHosts: inactiveUnion.size,
    severitySummary: buildSeveritySummaryFromGroups(groups),
    detection,
    resolution,
    availability,
    businessAvailability,
    contractedHosts: null,
  };
}

function buildSeveritySummaryFromGroups(
  groups: HostGroupMetric[]
): SeveritySummary[] | null {
  const severityLabels = new Map<number, string>();
  groups.forEach((group) =>
    group.severitySummary?.forEach((item) =>
      severityLabels.set(item.severity, item.label)
    )
  );

  const seenSeverityEvents = new Set<string>();
  const severityTotals = new Map<number, number>();
  groups.forEach((group) =>
    group.eventSeverities?.forEach(({ eventId, severity }) => {
      if (!eventId || seenSeverityEvents.has(eventId)) {
        return;
      }
      seenSeverityEvents.add(eventId);
      severityTotals.set(severity, (severityTotals.get(severity) ?? 0) + 1);
    })
  );

  if (severityTotals.size) {
    return Array.from(severityTotals.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([severity, count]) => ({
        severity,
        label: severityLabels.get(severity) ?? `Severidade ${severity}`,
        count,
      }));
  }

  const severityUnion = new Map<number, { label: string; count: number }>();
  groups.forEach((group) =>
    group.severitySummary?.forEach((item) => {
      const existing = severityUnion.get(item.severity);
      severityUnion.set(item.severity, {
        label: item.label,
        count: (existing?.count ?? 0) + item.count,
      });
    })
  );

  if (!severityUnion.size) {
    return null;
  }

  return Array.from(severityUnion.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([severity, info]) => ({
      severity,
      label: info.label,
      count: info.count,
    }));
}

function convertSummaryToSource(
  summary: OverviewSummary | null
): OverviewCardSource | null {
  if (!summary) return null;
  return {
    alerts: summary.alerts,
    openAlerts: summary.openAlerts,
    hosts: summary.hosts,
    inactiveHosts: summary.inactiveHosts,
    detection: summary.detection,
    resolution: summary.resolution,
    availability: summary.availability,
    businessAvailability: summary.businessAvailability,
    contractedHosts: summary.contractedHosts ?? null,
  };
}

function convertTotalsToSource(
  data: GroupMetricsApiResponse | null
): OverviewCardSource | null {
  if (!data) return null;
  return {
    alerts: data.totals.alerts ?? 0,
    openAlerts: data.totals.openAlerts ?? 0,
    hosts: data.totals.hostCount ?? 0,
    inactiveHosts: data.totals.inactiveHosts ?? 0,
    detection: data.kpis.detectionMinutes ?? 0,
    resolution: data.kpis.resolutionMinutes ?? 0,
    availability: data.kpis.availabilityPct ?? 0,
    businessAvailability: data.availability.businessPct ?? 0,
    contractedHosts: null,
  };
}

function convertSingleToSource(
  data: DashboardMetrics | null
): OverviewCardSource | null {
  if (!data) return null;
  return {
    alerts: data.groupTotals.alerts ?? 0,
    openAlerts: data.groupTotals.openAlerts ?? 0,
    hosts: data.groupTotals.hostCount ?? 0,
    inactiveHosts: data.groupTotals.inactiveHosts ?? 0,
    detection: data.kpis.detectionMinutes ?? 0,
    resolution: data.kpis.resolutionMinutes ?? 0,
    availability: data.kpis.availabilityPct ?? 0,
    businessAvailability: data.availability.businessPct ?? 0,
    contractedHosts: null,
  };
}

function HostGroupMultiSelect({
  options,
  selectedOptions,
  selectedIds,
  onChange,
}: HostGroupMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const summary = selectedOptions.length
    ? selectedOptions.length === 1
      ? selectedOptions[0].name
      : `${selectedOptions.length} selecionados`
    : "Todos os clientes";

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((value) => value !== id);
      onChange(next);
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function clear() {
    onChange([]);
  }

  const { filteredOptions, rawFilteredOptions } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? options.filter((option) =>
          option.name.toLowerCase().includes(q)
        )
      : options;
    const selectedSet = new Set(selectedIds);
    const selectedFirst = base.filter((option) =>
      selectedSet.has(option.groupid)
    );
    const remaining = base.filter(
      (option) => !selectedSet.has(option.groupid)
    );
    return {
      filteredOptions: [...selectedFirst, ...remaining],
      rawFilteredOptions: base,
    };
  }, [options, query, selectedIds]);

  function selectAllFiltered() {
    if (!rawFilteredOptions.length) return;
    const next = new Set(selectedIds);
    rawFilteredOptions.forEach((option) =>
      next.add(option.groupid)
    );
    onChange(Array.from(next));
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={`${FILTER_SELECT_CLASS} flex items-center justify-between gap-2`}
        onClick={() => setOpen((state) => !state)}
      >
        <span className="truncate">{summary}</span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M5 7l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-xl ring-1 ring-slate-100">
          <div className="space-y-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar host group..."
              className={DROPDOWN_INPUT_CLASS}
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {selectedIds.length
                  ? `${selectedIds.length} selecionado(s)`
                  : "Nenhum selecionado"}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={selectAllFiltered}
                  disabled={!rawFilteredOptions.length}
                >
                  Selecionar todos
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    className="font-semibold text-slate-500 transition hover:text-slate-700"
                    onClick={clear}
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto pr-1 pt-1 text-slate-700">
            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <label
                  key={option.groupid}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedIds.includes(option.groupid)}
                    onChange={() => toggle(option.groupid)}
                  />
                  <span className="truncate">{option.name}</span>
                </label>
              ))
            ) : (
              <p className="px-2 py-1 text-slate-400">
                Nenhum host group encontrado.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1) {
    return `${(value * 60).toFixed(0)}s`;
  }
  return value.toFixed(1);
}

function formatMinutesOrDash(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  const formatted = formatMinutes(value);
  return formatted || "0";
}

function formatListPreview(values: string[]) {
  if (!values.length) {
    return "";
  }
  if (values.length <= 2) {
    return values.join(", ");
  }
  const [first, second] = values;
  const remaining = values.length - 2;
  return `${first}, ${second} +${remaining}`;
}

function formatAlertDate(value: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "dd/MM HH:mm");
  } catch {
    return "—";
  }
}

function filterCriticalAlerts({
  alerts,
  selectedGroups,
  applyFilters,
}: {
  alerts: CriticalAlertHighlight[];
  selectedGroups: string[];
  applyFilters: boolean;
}) {
  if (!applyFilters) {
    return alerts;
  }

  if (!selectedGroups.length) {
    return alerts;
  }

  const selection = new Set(selectedGroups);
  return alerts.filter((alert) =>
    alert.groupIds.some((id) => selection.has(id))
  );
}

function sortCriticalAlerts(alerts: CriticalAlertHighlight[]) {
  return [...alerts].sort((a, b) => {
    if (a.isOpen !== b.isOpen) {
      return a.isOpen ? -1 : 1;
    }
    return (
      new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
    );
  });
}

function buildMonthOptions(length: number) {
  return Array.from({ length }, (_, index) => {
    const date = subMonths(new Date(), index);
    const label = format(date, "MMMM yyyy", { locale: ptBR });
    return {
      value: format(date, "yyyy-MM"),
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  });
}

function formatPrimaryValue(definition: CardDefinition, value: number) {
  if (!Number.isFinite(value)) return "-";
  return formatReferenceValue(definition, value);
}

function formatReferenceValue(definition: CardDefinition, value: number) {
  if (!Number.isFinite(value)) return "-";
  if (definition.unit === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (definition.unit === "minutes") {
    if (value < 1) {
      return `${Math.max(1, Math.round(value * 60))}s`;
    }
    const decimals = value >= 10 ? 0 : 1;
    return `${value.toFixed(decimals)} min`;
  }
  return value.toLocaleString("pt-BR");
}

function buildCardSubtitle(
  definition: CardDefinition,
  previousValue: number | null
) {
  const previousLabel =
    previousValue !== null && Number.isFinite(previousValue)
      ? formatReferenceValue(definition, previousValue)
      : null;

  if (typeof definition.target === "number") {
    const metaLabel = formatReferenceValue(definition, definition.target);
    return previousLabel
      ? `Meta: ${metaLabel} • Mês anterior: ${previousLabel}`
      : `Meta: ${metaLabel}`;
  }

  if (definition.description && previousLabel) {
    return `${definition.description} • Mês anterior: ${previousLabel}`;
  }
  if (definition.description) {
    return definition.description;
  }
  if (previousLabel) {
    return `Mês anterior: ${previousLabel}`;
  }
  return null;
}

function buildCardStatus(
  definition: CardDefinition,
  value: number,
  previousValue: number | null
): { label: string; tone: StatusTone } | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (typeof definition.target === "number") {
    const direction = definition.betterDirection ?? "higher";
    const delta =
      direction === "higher"
        ? value - definition.target
        : definition.target - value;
    if (delta >= 0) {
      return { label: "Dentro da meta", tone: "success" };
    }
    const warnMargin = definition.warnMargin ?? 0;
    if (warnMargin && delta >= -warnMargin) {
      return { label: "Em atenção", tone: "warning" };
    }
    return { label: "Abaixo da meta", tone: "danger" };
  }

  if (
    definition.betterDirection === "higher" &&
    previousValue !== null &&
    Number.isFinite(previousValue)
  ) {
    if (value > previousValue) {
      return { label: "Em alta", tone: "success" };
    }
    if (value < previousValue) {
      return { label: "Em queda", tone: "danger" };
    }
    return { label: "Estável", tone: "neutral" };
  }

  if (
    definition.betterDirection === "lower" &&
    previousValue !== null &&
    Number.isFinite(previousValue)
  ) {
    if (value < previousValue) {
      return { label: "Melhoria", tone: "success" };
    }
    if (value > previousValue) {
      return { label: "Em atenção", tone: "danger" };
    }
    return { label: "Estável", tone: "neutral" };
  }

  return null;
}

function buildTrendText(
  definition: CardDefinition,
  value: number,
  previousValue: number | null
) {
  if (
    previousValue === null ||
    !Number.isFinite(value) ||
    !Number.isFinite(previousValue)
  ) {
    return null;
  }

  const diff = value - previousValue;
  const epsilon =
    definition.unit === "percent"
      ? 0.01
      : definition.unit === "minutes"
      ? 0.1
      : 1;
  if (Math.abs(diff) < epsilon) {
    return "• Estável vs mês anterior";
  }
  const arrow = diff > 0 ? "↑" : "↓";
  return `• ${arrow} ${formatDiffValue(definition, diff)} vs mês anterior`;
}

function formatDiffValue(definition: CardDefinition, diff: number) {
  const abs = Math.abs(diff);
  if (definition.unit === "percent") {
    return `${abs.toFixed(2)} p.p.`;
  }
  if (definition.unit === "minutes") {
    const decimals = abs >= 10 ? 0 : 1;
    return `${abs.toFixed(decimals)} min`;
  }
  const unitLabel = getDifferenceUnitLabel(definition);
  return `${abs.toLocaleString("pt-BR")} ${unitLabel}`;
}

function getDifferenceUnitLabel(definition: CardDefinition) {
  if (definition.id === "hosts" || definition.id === "inactiveHosts") {
    return "hosts";
  }
  if (definition.id === "alerts" || definition.id === "openAlerts") {
    return "alertas";
  }
  return "unid.";
}

function buildPeriodRangeLabel(monthIso: string | null | undefined) {
  if (!monthIso) return null;
  const [yearStr, monthStr] = monthIso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  return `${format(startDate, "dd/MM/yyyy")} – ${format(endDate, "dd/MM/yyyy")}`;
}

function getPreviousMonthValue(monthIso: string | null | undefined) {
  if (!monthIso) return null;
  const [yearStr, monthStr] = monthIso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  const baseDate = new Date(year, month - 1, 1);
  const previousDate = subMonths(baseDate, 1);
  return format(previousDate, "yyyy-MM");
}

async function extractError(response: Response) {
  try {
    const data = await response.json();
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

type SortOrder = "asc" | "desc";
type GroupSortField =
  | "name"
  | "alerts"
  | "openAlerts"
  | "detection"
  | "resolution"
  | "availability"
  | "availabilityBusiness";
type HostSortField = GroupSortField;

function compareGroupMetrics(
  a: HostGroupMetric,
  b: HostGroupMetric,
  field: GroupSortField,
  order: SortOrder
) {
  const multiplier = order === "asc" ? 1 : -1;
  switch (field) {
    case "name":
      return multiplier * a.name.localeCompare(b.name, "pt-BR");
    case "alerts":
      return multiplier * (a.alerts - b.alerts);
    case "openAlerts":
      return multiplier * (a.openAlerts - b.openAlerts);
    case "detection":
      return multiplier * (a.detectionMinutes - b.detectionMinutes);
    case "resolution":
      return multiplier * (a.resolutionMinutes - b.resolutionMinutes);
    case "availability":
      return multiplier * (a.availabilityPct - b.availabilityPct);
    case "availabilityBusiness":
      return (
        multiplier *
        (a.businessAvailabilityPct - b.businessAvailabilityPct)
      );
    default:
      return 0;
  }
}

function compareHostMetrics(
  a: DashboardMetrics["hosts"][number],
  b: DashboardMetrics["hosts"][number],
  field: HostSortField,
  order: SortOrder
) {
  const multiplier = order === "asc" ? 1 : -1;
  switch (field) {
    case "name":
      return multiplier * a.name.localeCompare(b.name, "pt-BR");
    case "alerts":
      return multiplier * (a.eventCount - b.eventCount);
    case "openAlerts":
      return multiplier * (a.openEventCount - b.openEventCount);
    case "detection":
      return multiplier * (a.detectionMinutes - b.detectionMinutes);
    case "resolution":
      return multiplier * (a.resolutionMinutes - b.resolutionMinutes);
    case "availability":
      return multiplier * (a.availabilityPct - b.availabilityPct);
    case "availabilityBusiness":
      return (
        multiplier *
        (a.businessAvailabilityPct - b.businessAvailabilityPct)
      );
    default:
      return 0;
  }
}







