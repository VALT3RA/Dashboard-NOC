import Link from "next/link";
import { listOpenProblems } from "@/lib/open-problems";
import { OpenProblemsTable } from "@/components/open-problems-table";

export const dynamic = "force-dynamic";

export default async function OpenProblemsPage() {
  const data = await listOpenProblems();

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 sm:px-6 lg:px-10">
        <header className="flex flex-wrap items-start justify-between gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              Contego Security · Monitoramento
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Problemas em aberto
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Lista ao vivo com todos os alertas não resolvidos, independente
              dos filtros do dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              ← Voltar para o dashboard
            </Link>
            <a
              href="/api/open-problems"
              className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              target="_blank"
              rel="noreferrer"
            >
              Baixar JSON
            </a>
          </div>
        </header>

        <OpenProblemsTable
          problems={data.problems}
          generatedAt={data.generatedAt}
        />
      </div>
    </main>
  );
}
