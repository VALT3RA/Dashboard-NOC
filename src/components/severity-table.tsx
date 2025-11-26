"use client";

import { SeveritySummary } from "@/types/dashboard";

type Props = {
  summary?: SeveritySummary[] | null;
  title?: string;
  description?: string;
  context?: {
    client?: string | null;
    period?: string | null;
  };
};

type SeverityStyle = {
  bar: string;
  text: string;
  dot: string;
  contrastText?: string;
};

const SEVERITY_STYLES: Record<number, SeverityStyle> = {
  5: {
    bar: "bg-rose-600",
    text: "text-white",
    contrastText: "text-rose-700",
    dot: "bg-rose-600",
  },
  4: { bar: "bg-orange-500", text: "text-white", dot: "bg-orange-500" },
  3: { bar: "bg-amber-400", text: "text-slate-900", dot: "bg-amber-400" },
  2: { bar: "bg-sky-400", text: "text-white", dot: "bg-sky-400" },
  1: { bar: "bg-slate-400", text: "text-slate-900", dot: "bg-slate-400" },
  0: { bar: "bg-slate-300", text: "text-slate-900", dot: "bg-slate-300" },
};

export function SeverityTable({
  summary,
  title = "Distribuição de alertas por criticidade – últimos 30 dias",
  description,
  context,
}: Props) {
  if (!summary || !summary.length) {
    return null;
  }

  const orderedSummary = [...summary].sort((a, b) => b.severity - a.severity);
  const total = orderedSummary.reduce((acc, item) => acc + item.count, 0);
  if (!total) return null;

  const formatPercent = (count: number) =>
    total ? `${Math.round((count / total) * 100)}%` : "0%";

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="mb-6 space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          {title}
        </p>
        {description ? (
          <p className="text-sm text-slate-500">{description}</p>
        ) : null}
        {(context?.client || context?.period) && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            {context?.client && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {context.client}
              </span>
            )}
            {context?.period && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                {context.period}
              </span>
            )}
          </div>
        )}
        <p className="text-sm text-slate-600">
          Total de alertas no período:{" "}
          <span className="font-semibold text-slate-900">
            {total.toLocaleString("pt-BR")}
          </span>
        </p>
      </div>

      <div className="space-y-5">
        {orderedSummary.map((item) => {
          const percent = total ? (item.count / total) * 100 : 0;
          const percentLabel = formatPercent(item.count);
          const style = SEVERITY_STYLES[item.severity] ?? {
            bar: "bg-slate-400",
            text: "text-slate-900",
            dot: "bg-slate-400",
          };
          const textClass =
            percent < 12 && style.contrastText ? style.contrastText : style.text;

          return (
            <div key={item.severity} className="space-y-2">
              <div className="flex items-center justify-between text-sm font-medium text-slate-600">
                <span>{item.label}</span>
                <span>{percentLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative h-12 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`absolute left-0 top-0 h-full ${style.bar}`}
                    style={{ width: `${percent}%` }}
                  />
                  <div
                    className={`relative z-10 flex h-full items-center pl-4 text-base font-semibold ${textClass}`}
                  >
                    {item.count.toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedSummary.map((item) => {
          const percentLabel = formatPercent(item.count);
          const style = SEVERITY_STYLES[item.severity] ?? {
            bar: "bg-slate-400",
            text: "text-slate-900",
            dot: "bg-slate-400",
          };

          return (
            <div
              key={`card-${item.severity}`}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                {item.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {item.count.toLocaleString("pt-BR")}
              </div>
              <p className="text-sm text-slate-500">
                {percentLabel} dos alertas
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
