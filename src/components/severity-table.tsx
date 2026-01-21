"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
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

const SEVERITY_ORDER = [5, 4, 3, 2, 1, 0] as const;

const SEVERITY_COLORS: Record<
  number,
  { bar: string; labelText: string; pillBg: string }
> = {
  5: { bar: "#f04465", labelText: "#ffffff", pillBg: "#f04465" }, // disaster red
  4: { bar: "#ff7f00", labelText: "#ffffff", pillBg: "#ff7f00" }, // high orange
  3: { bar: "#ffc531", labelText: "#0f172a", pillBg: "#ffc531" }, // average yellow
  2: { bar: "#00b88a", labelText: "#ffffff", pillBg: "#00b88a" }, // warning green
  1: { bar: "#4ea8de", labelText: "#0f172a", pillBg: "#4ea8de" }, // info blue
  0: { bar: "#d4d4d8", labelText: "#0f172a", pillBg: "#d4d4d8" }, // not classified
};

const FALLBACK_LABEL: Record<number, string> = {
  5: "Desastre",
  4: "Alta",
  3: "Media",
  2: "Baixa",
  1: "Informativo",
  0: "Nao classificado",
};

export function SeverityTable({
  summary,
  title = "Distribuicao de alertas por criticidade",
  description,
  context,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const orderedSummary = useMemo(() => {
    if (!summary || !summary.length) return [];
    const map = new Map(summary.map((item) => [item.severity, item]));
    return SEVERITY_ORDER.map((level) => {
      const found = map.get(level);
      return (
        found ?? {
          severity: level,
          label: FALLBACK_LABEL[level] ?? `Severidade ${level}`,
          count: 0,
        }
      );
    });
  }, [summary]);

  const total = useMemo(
    () => orderedSummary.reduce((acc, item) => acc + item.count, 0),
    [orderedSummary]
  );

  const maxCount = useMemo(
    () =>
      orderedSummary.length
        ? Math.max(...orderedSummary.map((item) => item.count), 0)
        : 0,
    [orderedSummary]
  );

  const formatPercent = (count: number) =>
    total ? `${Math.round((count / total) * 100)}%` : "0%";

  const handleExport = async () => {
    if (!chartRef.current || exporting) return;
    try {
      setExporting(true);
      const dataUrl = await toPng(chartRef.current, {
        pixelRatio: 2,
        backgroundColor: "transparent",
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `severidade-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Falha ao exportar grafico de severidade", error);
    } finally {
      setExporting(false);
    }
  };

  if (!orderedSummary.length) {
    return null;
  }

  const widthPx = 870;
  const heightPx = 400;
  const chartHeightPx = 260;
  const barWidthPx = 64;
  const labelColor = "#ffffff";

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
            {title}
          </p>
          {description ? (
            <p className="text-sm text-slate-600">{description}</p>
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
            Total de alertas no periodo:{" "}
            <span className="font-semibold text-slate-900">
              {total.toLocaleString("pt-BR")}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting ? "Gerando imagem..." : "Exportar grafico"}
        </button>
      </div>

      {maxCount === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Nenhum alerta encontrado para o periodo selecionado.
        </div>
      ) : (
        <div
          ref={chartRef}
          className="mt-6 flex items-center justify-center"
          style={{
            width: widthPx,
            height: heightPx,
            backgroundColor: exporting ? "transparent" : "#0b0f1a",
          }}
        >
          <div className="flex h-full w-full items-end justify-between px-12 pb-12">
            {orderedSummary.map((item) => {
              const colors = SEVERITY_COLORS[item.severity] ?? {
                bar: "#d4d4d8",
                labelText: "#ffffff",
                pillBg: "#d4d4d8",
              };
              const barHeight = Math.max(
                10,
                (item.count / (maxCount || 1)) * chartHeightPx
              );
              return (
                <div
                  key={item.severity}
                  className="flex min-w-[120px] flex-col items-center gap-2"
                >
                  <div
                    className="text-lg font-extrabold"
                    style={{ color: labelColor }}
                  >
                    {item.count.toLocaleString("pt-BR")}
                  </div>
                  <div
                    className="relative w-[64px] rounded-2xl shadow-lg shadow-black/30"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: colors.bar,
                    }}
                  >
                    <div className="absolute inset-0 rounded-2xl border border-white/15" />
                  </div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: labelColor }}
                  >
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
