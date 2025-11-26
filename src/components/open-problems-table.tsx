"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search } from "lucide-react";
import { OpenProblemDetail } from "@/types/dashboard";

type Props = {
  problems: OpenProblemDetail[];
  generatedAt: string;
};

const severityStyles: Record<
  number,
  { badge: string; text: string; border: string }
> = {
  5: {
    badge: "bg-rose-100 text-rose-700",
    text: "text-rose-700",
    border: "border-rose-100",
  },
  4: {
    badge: "bg-orange-100 text-orange-700",
    text: "text-orange-700",
    border: "border-orange-100",
  },
  3: {
    badge: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
    border: "border-amber-100",
  },
  2: {
    badge: "bg-sky-100 text-sky-700",
    text: "text-sky-700",
    border: "border-sky-100",
  },
  1: {
    badge: "bg-slate-100 text-slate-600",
    text: "text-slate-600",
    border: "border-slate-100",
  },
  0: {
    badge: "bg-slate-100 text-slate-600",
    text: "text-slate-600",
    border: "border-slate-100",
  },
};

export function OpenProblemsTable({ problems, generatedAt }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return problems;
    }
    const term = query.trim().toLowerCase();
    return problems.filter((problem) => {
      if (problem.name.toLowerCase().includes(term)) return true;
      if (
        problem.hosts.some((host) =>
          host.name.toLowerCase().includes(term)
        )
      ) {
        return true;
      }
      if (
        problem.groupNames.some((group) =>
          group.toLowerCase().includes(term)
        )
      ) {
        return true;
      }
      return false;
    });
  }, [problems, query]);

  return (
    <section className="space-y-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
            Problemas em aberto
          </p>
          <h2 className="text-2xl font-semibold text-slate-900">
            {filtered.length} registros encontrados
          </h2>
          <p className="text-sm text-slate-500">
            Atualizado em{" "}
            <span className="font-semibold text-slate-900">
              {format(new Date(generatedAt), "dd/MM/yyyy HH:mm", {
                locale: ptBR,
              })}
            </span>
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por problema, host ou grupo..."
            className="w-64 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </label>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm text-slate-600">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Problema</th>
              <th className="px-4 py-3 text-left">Código</th>
              <th className="px-4 py-3 text-left">Hosts</th>
              <th className="px-4 py-3 text-left">Grupos</th>
              <th className="px-4 py-3 text-left">Criticidade</th>
              <th className="px-4 py-3 text-left">Abertura</th>
              <th className="px-4 py-3 text-left">Tempo aberto</th>
              <th className="px-4 py-3 text-left">Detecção</th>
              <th className="px-4 py-3 text-left">Resposta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((problem) => {
              const severityStyle = severityStyles[problem.severity] ?? {
                badge: "bg-slate-100 text-slate-600",
                text: "text-slate-600",
                border: "border-slate-100",
              };
              return (
                <tr
                  key={problem.eventId}
                  className="bg-white transition hover:bg-slate-50"
                >
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    <div>{problem.name}</div>
                    {problem.tags.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Tags:{" "}
                        {problem.tags
                          .map((tag) =>
                            tag.value ? `${tag.tag}:${tag.value}` : tag.tag
                          )
                          .join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    {problem.eventId}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="space-y-1 text-sm text-slate-700">
                      {problem.hosts.map((host) => (
                        <li key={host.hostid}>{host.name}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="space-y-1 text-sm text-slate-700">
                      {problem.groupNames.length
                        ? problem.groupNames.map((group) => (
                            <li key={group}>{group}</li>
                          ))
                        : "—"}
                    </ul>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${severityStyle.badge}`}
                    >
                      {problem.severityLabel}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    {format(new Date(problem.openedAt), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    {formatDuration(problem.durationMinutes)}
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    {formatMinutes(problem.detectionMinutes)}
                  </td>
                  <td className="px-4 py-4 align-top text-sm font-semibold text-slate-900">
                    {formatMinutes(problem.responseMinutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatMinutes(value: number | null) {
  if (value === null || value === undefined) {
    return "—";
  }
  if (value <= 0) {
    return "0 min";
  }
  if (value < 1) {
    return `${Math.round(value * 60)} s`;
  }
  return `${value.toFixed(1)} min`;
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 min";
  }
  const totalMinutes = Math.floor(minutes);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  const segments = [];
  if (days) segments.push(`${days}d`);
  if (hours) segments.push(`${hours}h`);
  if (mins && segments.length < 2) segments.push(`${mins}min`);
  if (!segments.length) {
    return `${mins}min`;
  }
  return segments.join(" ");
}
