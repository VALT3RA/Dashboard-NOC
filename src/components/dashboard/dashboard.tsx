"use client";

import { useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Bolt, Clock3, Search } from "lucide-react";
import { DashboardFilters } from "@/components/dashboard/filters";
import { MetricCard } from "@/components/dashboard/metric-card";
import { CategoryTable } from "@/components/dashboard/category-table";
import { AvailabilityCard } from "@/components/dashboard/availability-card";
import { AccuracyCard } from "@/components/dashboard/accuracy-card";
import {
  DashboardMetrics,
  DashboardApiResponse,
  HostGroupOption,
  HostGroupsApiResponse,
} from "@/types/dashboard";

const monthOptions = buildMonthOptions(12);
const currentMonth = monthOptions[0]?.value ?? format(new Date(), "yyyy-MM");

export function Dashboard() {
  const [hostGroups, setHostGroups] = useState<HostGroupOption[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/host-groups")
      .then(async (response) => {
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        const data = (await response.json()) as HostGroupsApiResponse;
        if (isMounted) {
          setHostGroups(data.groups);
        }
      })
      .catch((err) => {
        console.error("Host groups", err);
        if (isMounted) {
          setError(
            "Não foi possível carregar a lista de clientes. Verifique a configuração do token."
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/metrics?month=${selectedMonth}${
            selectedGroup ? `&groupId=${selectedGroup}` : ""
          }`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const message = await extractError(response);
          throw new Error(message);
        }
        const data = (await response.json()) as DashboardApiResponse;
        if (active) {
          setMetrics(data.metrics);
        }
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        console.error("Metrics", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as métricas."
        );
        setMetrics(null);
      } finally {
        if (active && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadMetrics();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedMonth, selectedGroup]);

  const kpiConfig = useMemo(() => {
    if (!metrics) return [];
    return [
      {
        id: "detection",
        title: "Tempo médio de detecção",
        value: metrics.kpis.detectionMinutes,
        unit: "min",
        target: 2,
        betterWhen: "lower" as const,
        icon: <Search className="h-5 w-5" />,
        accent: "from-sky-500 to-blue-600",
      },
      {
        id: "response",
        title: "Tempo médio de resposta",
        value: metrics.kpis.responseMinutes,
        unit: "min",
        target: 5,
        betterWhen: "lower" as const,
        icon: <Bolt className="h-5 w-5" />,
        accent: "from-indigo-500 to-blue-700",
      },
      {
        id: "resolution",
        title: "Tempo médio de resolução",
        value: metrics.kpis.resolutionMinutes,
        unit: "min",
        target: 10,
        betterWhen: "lower" as const,
        icon: <Clock3 className="h-5 w-5" />,
        accent: "from-purple-500 to-fuchsia-600",
      },
      {
        id: "availability",
        title: "Disponibilidade geral",
        value: metrics.kpis.availabilityPct,
        unit: "%",
        target: 99.8,
        betterWhen: "higher" as const,
        icon: <Activity className="h-5 w-5" />,
        accent: "from-emerald-500 to-teal-600",
      },
    ];
  }, [metrics]);

  return (
    <div className="space-y-8">
      <HeroBanner metrics={metrics} />
      <DashboardFilters
        months={monthOptions}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        hostGroups={hostGroups}
        selectedGroup={selectedGroup}
        onGroupChange={setSelectedGroup}
        isLoading={loading}
      />
      {error && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}
      {loading && !metrics ? (
        <SkeletonState />
      ) : metrics ? (
        <>
          <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {kpiConfig.map((kpi) => (
              <MetricCard
                key={kpi.id}
                title={kpi.title}
                value={kpi.value}
                unit={kpi.unit}
                target={kpi.target}
                betterWhen={kpi.betterWhen}
                icon={kpi.icon}
                accentClass={kpi.accent}
              />
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CategoryTable
                categories={metrics.hostCategories}
                totals={metrics.totals}
              />
            </div>
            <div className="space-y-6">
              <AvailabilityCard availability={metrics.availability} />
              <AccuracyCard accuracy={metrics.accuracy} />
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-center text-slate-500">
          Ajuste os filtros para ver os dados.
        </div>
      )}
    </div>
  );
}

function HeroBanner({ metrics }: { metrics: DashboardMetrics | null }) {
  return (
    <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-8 text-white shadow-xl">
      <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
        Contego Security · NOC & MSS
      </p>
      <h1 className="mt-3 text-3xl font-semibold">
        Indicadores de Performance e Métricas Detalhadas
      </h1>
      <p className="mt-2 text-base text-slate-200">
        Resultados quantitativos do monitoramento e segurança proporcionados
        pela Contego.
      </p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-200">
        <span className="rounded-2xl bg-white/10 px-4 py-2">
          Período:{" "}
          <strong className="text-white">
            {metrics?.meta.period ?? format(new Date(), "MMMM yyyy", { locale: ptBR })}
          </strong>
        </span>
        <span className="rounded-2xl bg-white/10 px-4 py-2">
          Cliente:{" "}
          <strong className="text-white">
            {metrics?.meta.groupName ?? "Todos os clientes"}
          </strong>
        </span>
        <span className="rounded-2xl bg-white/10 px-4 py-2">
          Atualizado em:{" "}
          <strong className="text-white">
            {metrics
              ? format(new Date(metrics.meta.generatedAt), "dd/MM/yyyy HH:mm")
              : "—"}
          </strong>
        </span>
      </div>
    </section>
  );
}

function SkeletonState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-40 animate-pulse rounded-3xl bg-slate-200/60"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-3xl bg-slate-200/60 lg:col-span-2" />
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-3xl bg-slate-200/60" />
          <div className="h-40 animate-pulse rounded-3xl bg-slate-200/60" />
        </div>
      </div>
    </div>
  );
}

function buildMonthOptions(length: number) {
  return Array.from({ length }, (_, index) => {
    const date = subMonths(new Date(), index);
    const label = format(date, "MMMM yyyy", { locale: ptBR });
    return {
      value: format(date, "yyyy-MM"),
      label: capitalize(label),
    };
  });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function extractError(response: Response) {
  try {
    const data = await response.json();
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
