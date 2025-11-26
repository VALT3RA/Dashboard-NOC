"use client";

import clsx from "clsx";
import { DashboardMetrics } from "@/types/dashboard";

type AvailabilityCardProps = {
  availability: DashboardMetrics["availability"];
};

const LINES = [
  {
    id: "business",
    label: "Horário Comercial (7h-23:59)",
    color: "from-emerald-500 to-green-600",
    accessor: (availability: DashboardMetrics["availability"]) =>
      availability.businessPct,
  },
  {
    id: "off",
    label: "Fora do Expediente",
    color: "from-blue-500 to-indigo-600",
    accessor: (availability: DashboardMetrics["availability"]) =>
      availability.offHoursPct,
  },
];

export function AvailabilityCard({ availability }: AvailabilityCardProps) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-emerald-600">
          📈
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">
            Disponibilidade por Horário
          </p>
          <p className="text-sm text-slate-500">
            Comparativo entre janela comercial e fora do expediente.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {LINES.map((line) => {
          const value = line.accessor(availability);
          return (
            <div key={line.id}>
              <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>{line.label}</span>
                <span className="text-emerald-600">{value.toFixed(2)}%</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-100">
                <div
                  className={clsx(
                    "h-3 rounded-full bg-gradient-to-r",
                    line.color
                  )}
                  style={{ width: `${Math.min(100, value)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
