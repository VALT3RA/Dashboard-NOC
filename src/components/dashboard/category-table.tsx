"use client";

import { DashboardMetrics } from "@/types/dashboard";

type CategoryTableProps = {
  categories: DashboardMetrics["hostCategories"];
  totals: DashboardMetrics["totals"];
};

export function CategoryTable({ categories, totals }: CategoryTableProps) {
  const rows = [
    ...categories,
    {
      id: "total",
      label: "Total",
      count: totals.hosts,
      coveragePct: totals.coveragePct,
      slaPct: totals.slaPct,
    },
  ];

  return (
    <div className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center gap-2 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-blue-600">
          ⛑️
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">
            Hosts Monitorados por Categoria
          </p>
          <p className="text-sm text-slate-500">
            Distribuição por tipo de ativo monitorado.
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Categoria</th>
              <th className="px-4 py-3 text-right font-medium">Quantidade</th>
              <th className="px-4 py-3 text-right font-medium">
                % de Cobertura
              </th>
              <th className="px-4 py-3 text-right font-medium">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-right">{row.count}</td>
                <td className="px-4 py-3 text-right">
                  {row.coveragePct.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">
                  {row.slaPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
