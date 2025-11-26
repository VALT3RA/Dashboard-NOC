"use client";

import clsx from "clsx";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  type MouseEvent as ReactMouseEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DailySeriesPoint,
  SeverityVisualConfig,
} from "./daily-alerts-types";

type DailyAlertsChartProps = {
  data: DailySeriesPoint[];
  severityScale: ReadonlyArray<SeverityVisualConfig>;
  maxTotal: number;
};

type TooltipState = {
  point: DailySeriesPoint;
  left: number;
  top: number;
};

const CHART_HEIGHT = 320; // Ajuste a altura do gráfico aqui se precisar de mais/menos espaço vertical.
const MIN_COLUMN_HEIGHT_PERCENT = 6;

export function DailyAlertsChart({
  data,
  severityScale,
  maxTotal,
}: DailyAlertsChartProps) {
  const [activeLevels, setActiveLevels] = useState<number[]>(() =>
    severityScale.map((item) => item.level)
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const severityOrder = useMemo(
    () => severityScale.map((item) => item.level),
    [severityScale]
  );

  const visibleSeverities = useMemo(
    () => severityScale.filter((item) => activeLevels.includes(item.level)),
    [activeLevels, severityScale]
  );

  const maxValue = Math.max(maxTotal, 1);

  const toggleSeverity = (level: number) => {
    setActiveLevels((current) => {
      const isActive = current.includes(level);
      if (isActive && current.length === 1) {
        return current;
      }
      const next = isActive
        ? current.filter((item) => item !== level)
        : [...current, level];
      next.sort(
        (a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b)
      );
      return next;
    });
  };

  const showTooltip = (
    point: DailySeriesPoint,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();

    setTooltip({
      point,
      left: targetRect.left - containerRect.left + targetRect.width / 2,
      top: targetRect.top - containerRect.top,
    });
  };

  const hideTooltip = () => setTooltip(null);

  return (
    <div className="relative">
      {/* Legenda interativa - ajuste de ordem/labels diretamente em severityScale */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        {severityScale.map((item) => {
          const isActive = activeLevels.includes(item.level);
          return (
            <button
              key={item.level}
              type="button"
              onClick={() => toggleSeverity(item.level)}
              className={clsx(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-800",
                isActive
                  ? "border-transparent bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500"
              )}
              aria-pressed={isActive}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-white/60"
                style={{ backgroundColor: item.colorHex }}
              />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="relative mt-6 w-full">
        <div
          ref={scrollContainerRef}
          className="relative w-full overflow-x-auto overflow-y-visible"
        >
          <div className="relative flex min-w-[960px] gap-6 rounded-3xl bg-slate-50 px-6 pb-10 pt-12">
            {data.map((point) => {
              const dayDate = new Date(point.day);
              const formattedDay = format(dayDate, "dd/MM", { locale: ptBR });
              const totalLabel = point.total.toLocaleString("pt-BR");
              const segments = visibleSeverities.map((severity) => ({
                severity,
                value: point.breakdown[severity.level] ?? 0,
              }));
              const visibleTotal = segments.reduce(
                (sum, segment) => sum + segment.value,
                0
              );
              const columnHeightPercent = visibleTotal
                ? Math.max(
                    (visibleTotal / maxValue) * 100,
                    MIN_COLUMN_HEIGHT_PERCENT
                  )
                : 0;

              return (
                <div
                  key={point.day}
                  className="group relative flex min-w-[110px] flex-1 flex-col items-center gap-3 text-xs text-slate-600"
                  onMouseEnter={(event) => showTooltip(point, event)}
                  onMouseMove={(event) => showTooltip(point, event)}
                  onMouseLeave={hideTooltip}
                >
                  <div className="rounded-full bg-white px-3 py-1 text-base font-semibold text-slate-800 shadow-sm">
                    {totalLabel}
                  </div>

                  <div
                    className="flex w-full items-end rounded-2xl bg-white/70 px-3 pb-3 pt-4 shadow-inner"
                    style={{ height: CHART_HEIGHT }}
                  >
                    {visibleTotal > 0 ? (
                      <div
                        className="relative flex w-full flex-col justify-end gap-px overflow-hidden rounded-2xl bg-slate-900/5 ring-1 ring-slate-900/10 transition-[height] duration-200"
                        style={{ height: `${columnHeightPercent}%` }}
                      >
                        {segments.map((segment) => {
                          if (!segment.value) {
                            return null;
                          }
                          const segmentHeightPercent = (segment.value / visibleTotal) * 100;
                          return (
                            <div
                              key={`${point.day}-${segment.severity.level}`}
                              className="flex w-full items-center justify-center text-[11px] font-semibold text-white/95 shadow-sm transition-[height] duration-200"
                              style={{
                                height: `${segmentHeightPercent}%`,
                                backgroundColor: segment.severity.colorHex,
                              }}
                            >
                              {segmentHeightPercent >= 16 ? segment.value : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-2 w-full rounded-full bg-slate-200" />
                    )}
                  </div>

                  <span className="-rotate-6 text-sm font-medium text-slate-700">
                    {formattedDay}
                  </span>
                </div>
              );
            })}
          </div>

          {tooltip ? (
            <div
              className="pointer-events-none absolute z-20 rounded-2xl bg-slate-900/95 px-4 py-3 text-xs text-white shadow-2xl ring-1 ring-black/10"
              style={{
                left: tooltip.left,
                top: tooltip.top,
                transform: "translate(-50%, -110%)",
              }}
            >
              {/* Ajuste o formato/texto do tooltip aqui */}
              <p className="text-sm font-semibold">
                {format(new Date(tooltip.point.day), "dd/MM", { locale: ptBR })}
              </p>
              <div className="mt-2 flex flex-col gap-1 text-[11px]">
                {severityScale.map((severity) => {
                  const count = tooltip.point.breakdown[severity.level] ?? 0;
                  return (
                    <div
                      key={`tooltip-${severity.level}`}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: severity.colorHex }}
                      />
                      <span className="flex-1">
                        {severity.label}:{" "}
                        <span className="font-semibold">{count}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-white/10 pt-2 text-[11px] font-semibold">
                Total: {tooltip.point.total}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
