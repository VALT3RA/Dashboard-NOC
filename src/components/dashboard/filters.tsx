"use client";

type FiltersProps = {
  months: Array<{ value: string; label: string }>;
  selectedMonth: string;
  onMonthChange: (value: string) => void;
  hostGroups: Array<{ groupid: string; name: string }>;
  selectedGroup?: string;
  onGroupChange: (value?: string) => void;
  isLoading?: boolean;
};

export function DashboardFilters({
  months,
  selectedMonth,
  onMonthChange,
  hostGroups,
  selectedGroup,
  onGroupChange,
  isLoading,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm ring-1 ring-black/5 md:flex-row md:items-end">
      <label className="flex flex-1 flex-col text-sm font-medium text-slate-500">
        Mês de referência
        <select
          value={selectedMonth}
          onChange={(event) => onMonthChange(event.target.value)}
          className="mt-2 h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          {months.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-sm font-medium text-slate-500">
        Cliente (Host Group)
        <select
          value={selectedGroup ?? ""}
          onChange={(event) =>
            onGroupChange(event.target.value || undefined)
          }
          className="mt-2 h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="">Todos os clientes</option>
          {hostGroups.map((group) => (
            <option key={group.groupid} value={group.groupid}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex h-12 items-center rounded-2xl bg-slate-50 px-4 text-sm font-semibold text-slate-500">
        {isLoading ? "Atualizando..." : "Dados atualizados"}
      </div>
    </div>
  );
}
