import Link from "next/link";
import { GlobalOverview } from "@/components/global-overview";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full space-y-6 px-4 sm:px-6 lg:px-10 xl:px-16">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-slate-500">
              Operação Contego
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Painel principal
            </h1>
          </div>
          <Link
            href="/zabbix-dashboard"
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-slate-700"
          >
            Abrir dashboard do Zabbix
          </Link>
        </header>
        <GlobalOverview />
      </div>
    </main>
  );
}
