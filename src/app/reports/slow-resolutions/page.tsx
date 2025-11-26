"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSearchParams } from "next/navigation";
import { CriticalAlertHighlight, GroupMetricsApiResponse } from "@/types/dashboard";

type Row = CriticalAlertHighlight & { resolutionMinutes: number };

export default function SlowResolutionsPage() {
  const search = useSearchParams();
  const month = search.get("month") ?? new Date().toISOString().slice(0, 7);
  const groupIds = search.get("groupIds") ?? "";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/group-metrics?month=${month}${
            groupIds ? `&groupIds=${groupIds}` : ""
          }`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? response.statusText);
        }
        const data = (await response.json()) as GroupMetricsApiResponse;
        const critical = data.criticalAlerts ?? [];
        const mapped: Row[] = critical.map((alert) => ({
          ...alert,
          resolutionMinutes: alert.resolutionMinutes ?? 0,
        }));
        setRows(mapped);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar dados.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [month, groupIds]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (b.resolutionMinutes ?? 0) - (a.resolutionMinutes ?? 0)
      ),
    [rows]
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            Relatório
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">
            Alertas com maior tempo de resolução
          </h1>
          <p className="text-sm text-slate-500">
            Mês: {month}
            {groupIds ? ` · Grupos: ${groupIds}` : " · Todos os grupos"}
          </p>
        </div>
        <Link
          href={`/?month=${encodeURIComponent(month)}${
            groupIds ? `&groupIds=${encodeURIComponent(groupIds)}` : ""
          }`}
          className="inline-flex items-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Voltar ao dashboard
        </Link>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-2xl bg-slate-100"
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          Nenhum alerta encontrado para o período.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Evento</th>
                <th className="px-4 py-3 text-left">Grupos</th>
                <th className="px-4 py-3 text-left">Hosts</th>
                <th className="px-4 py-3 text-left">Abertura</th>
                <th className="px-4 py-3 text-left">Encerramento</th>
                <th className="px-4 py-3 text-right">Resolução (min)</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((alert) => (
                <tr key={alert.eventId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {alert.name} <span className="text-xs text-slate-500">#{alert.eventId}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {alert.groupNames.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {alert.hostNames.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {format(new Date(alert.openedAt), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {alert.closedAt
                      ? format(new Date(alert.closedAt), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {alert.resolutionMinutes.toFixed(1)}
                  </td>
                  <td className="px-4 py-3">
                    {alert.isOpen ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        Aberto
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Fechado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
