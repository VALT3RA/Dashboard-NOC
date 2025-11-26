"use client";

import { DashboardMetrics } from "@/types/dashboard";

type AccuracyCardProps = {
  accuracy: DashboardMetrics["accuracy"];
};

export function AccuracyCard({ accuracy }: AccuracyCardProps) {
  return (
    <div className="rounded-3xl border border-rose-100 bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
          ⚠️
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">
            Falsos Positivos/Negativos
          </p>
          <p className="text-sm text-slate-500">
            Classificação baseada em tags e comentários dos incidentes.
          </p>
        </div>
      </div>
      <dl className="space-y-3 text-sm text-slate-600">
        <div className="flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-2">
          <dt className="font-semibold text-rose-600">Falsos Positivos</dt>
          <dd>{accuracy.falsePositivePct.toFixed(1)}%</dd>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-indigo-50 px-4 py-2">
          <dt className="font-semibold text-indigo-600">Falsos Negativos</dt>
          <dd>{accuracy.falseNegativePct.toFixed(1)}%</dd>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-2">
          <dt className="font-semibold text-emerald-600">Precisão do Sistema</dt>
          <dd>{accuracy.precisionPct.toFixed(1)}%</dd>
        </div>
      </dl>
    </div>
  );
}
