import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { buildDailyZabbixDashboardMetrics } from "@/lib/zabbix-daily-dashboard";

const integerFormatter = new Intl.NumberFormat("pt-BR");

export const dynamic = "force-dynamic";

export default async function ZabbixDashboardPage() {
  const metrics = await buildDailyZabbixDashboardMetrics();
  const periodStart = new Date(metrics.periodStart);
  const periodEnd = new Date(metrics.periodEnd);
  const generatedAt = new Date(metrics.generatedAt);

  const cards: DashboardCardProps[] = [
    {
      label: "Alertas abertos hoje",
      value: integerFormatter.format(metrics.openCount),
      subtitle: "Eventos aguardando resolução",
      accent: "from-rose-600 to-rose-800",
    },
    {
      label: "Alertas resolvidos",
      value: integerFormatter.format(metrics.resolvedCount),
      subtitle: "Encerrados no período",
      accent: "from-emerald-500 to-emerald-700",
    },
    {
      label: "Tempo médio de detecção",
      value: formatMinutesValue(metrics.detectionAvgMinutes),
      subtitle: "Disparo até o 1º ACK",
      accent: "from-sky-500 to-blue-600",
    },
    {
      label: "Tempo médio de resolução",
      value: formatMinutesValue(metrics.resolutionAvgMinutes),
      subtitle: "Abertura ao encerramento",
      accent: "from-amber-500 to-orange-600",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 py-10 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 lg:px-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.8em] text-slate-500">
            Zabbix · Operação diária
          </p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold text-white sm:text-5xl">
                Painel geral do dia
              </h1>
              <p className="mt-2 text-base text-slate-300 sm:text-lg">
                Intervalo considerado:{" "}
                <span className="font-semibold text-white">
                  {format(periodStart, "dd/MM HH:mm", { locale: ptBR })} —{" "}
                  {format(periodEnd, "HH:mm", { locale: ptBR })}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300">
              Atualizado às{" "}
              <span className="text-white">
                {format(generatedAt, "HH:mm:ss", { locale: ptBR })}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <DashboardCard key={card.label} {...card} />
          ))}
        </section>
      </div>
    </main>
  );
}

type DashboardCardProps = {
  label: string;
  value: string;
  subtitle: string;
  accent: string;
};

function DashboardCard({ label, value, subtitle, accent }: DashboardCardProps) {
  return (
    <article
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${accent} p-6 shadow-2xl`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_70%)] opacity-30" />
      <div className="relative flex h-full flex-col">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
          {label}
        </p>
        <p className="mt-6 text-5xl font-semibold text-white">{value}</p>
        <p className="mt-auto text-sm font-medium text-white/85">{subtitle}</p>
      </div>
    </article>
  );
}

function formatMinutesValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    if (hours && minutes) {
      return `${hours}h ${minutes}min`;
    }
    if (hours) {
      return `${hours}h`;
    }
  }
  if (value < 1) {
    return `${Math.round(value * 60)}s`;
  }
  return `${value.toFixed(1)} min`;
}
