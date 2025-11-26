"use client";

import { ReactNode } from "react";
import clsx from "clsx";

type MetricCardProps = {
  title: string;
  value: number;
  unit?: string;
  target?: number;
  betterWhen?: "lower" | "higher";
  icon?: ReactNode;
  accentClass?: string;
};

export function MetricCard({
  title,
  value,
  unit,
  target,
  betterWhen = "lower",
  icon,
  accentClass = "from-sky-500 to-blue-600",
}: MetricCardProps) {
  const formattedValue = formatValue(value, unit);
  const delta =
    target && target > 0
      ? betterWhen === "higher"
        ? ((value - target) / target) * 100
        : ((target - value) / target) * 100
      : 0;
  const trendLabel =
    delta === 0
      ? "em linha"
      : `${Math.abs(delta).toFixed(0)}% ${
          delta >= 0 ? (betterWhen === "higher" ? "acima" : "abaixo") : betterWhen === "higher" ? "abaixo" : "acima"
        }`;
  const progress =
    target && target > 0
      ? Math.min(
          betterWhen === "higher"
            ? value / target
            : target / Math.max(value, 0.001),
          1
        )
      : 1;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-semibold text-slate-900">
              {formattedValue}
            </span>
            {unit && (
              <span className="text-base font-medium uppercase text-slate-400">
                {unit}
              </span>
            )}
          </div>
        </div>
        <div
          className={clsx(
            "inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white",
            accentClass
          )}
        >
          {icon}
        </div>
      </div>
      {target && (
        <>
          <div className="mt-4 h-2 rounded-full bg-slate-100">
            <div
              className={clsx(
                "h-2 rounded-full bg-gradient-to-r transition-all",
                accentClass
              )}
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">Meta:</span>
            <span>
              {target} {unit}
            </span>
            <span className="text-emerald-600">| {trendLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}

function formatValue(value: number, unit?: string) {
  if (unit === "%" || unit === "percent") {
    return `${value.toFixed(1)}%`;
  }
  if (unit === "min") {
    return value.toFixed(1);
  }
  if (Math.abs(value) > 1000) {
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }
  return value.toFixed(1);
}
