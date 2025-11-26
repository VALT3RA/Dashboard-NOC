import Link from "next/link";
import { fetchHostsMonitoredByProxy } from "@/lib/zabbix";

const PROXY_HOST = "ARPRX001CTG";
const numberFormatter = new Intl.NumberFormat("pt-BR");

export const dynamic = "force-dynamic";

export default async function ArprxProxyHostsPage() {
  const { proxy, hosts } = await fetchHostsMonitoredByProxy(PROXY_HOST);

  if (!proxy) {
    return (
      <main className="min-h-screen bg-slate-100 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-8 px-4 sm:px-6 lg:px-12">
          <header className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-slate-500">
              Inventário de Proxy
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              Proxy {PROXY_HOST} não encontrado
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Não foi possível localizar o proxy informado no Zabbix. Verifique
              o nome e tente novamente.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar ao dashboard
              </Link>
            </div>
          </header>
        </div>
      </main>
    );
  }

  const activeHosts = hosts.filter(
    (host) => host.status === "0" || host.status === 0
  );

  const hostRows = activeHosts
    .map((host) => ({
      id: host.hostid,
      name: host.name,
      alias:
        host.inventory?.alias ||
        host.inventory?.type_full ||
        host.inventory?.os ||
        null,
      itemCount: host.items?.length ?? 0,
    }))
    .sort((a, b) => {
      if (b.itemCount !== a.itemCount) {
        return b.itemCount - a.itemCount;
      }
      return a.name.localeCompare(b.name);
    });

  const totalItems = hostRows.reduce((total, host) => total + host.itemCount, 0);
  const averageItems = hostRows.length ? totalItems / hostRows.length : 0;

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 sm:px-6 lg:px-12">
        <header className="flex flex-wrap justify-between gap-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
              Proxy monitorado
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">
              Hosts ativos via {proxy.host}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-600">
              Listagem completa dos hosts monitorados pelo proxy {proxy.host},
              considerando apenas aqueles habilitados e a quantidade total de
              itens vinculados a cada um deles.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Link
              href="/"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Voltar
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Hosts ativos"
            value={hostRows.length}
            description="Total monitorado pelo proxy"
          />
          <StatCard
            label="Itens monitorados"
            value={totalItems}
            description="Soma dos itens em todos os hosts"
          />
          <StatCard
            label="Itens médios por host"
            value={Number(averageItems.toFixed(1))}
            description="Distribuição média entre os hosts"
          />
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Inventário detalhado
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {hostRows.length
                  ? `${hostRows.length} hosts listados`
                  : "Nenhum host ativo encontrado"}
              </h2>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Host</th>
                  <th className="px-4 py-2">Apelido / descrição</th>
                  <th className="px-4 py-2 text-right">Itens monitorados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {hostRows.map((host) => (
                  <tr key={host.id} className="transition hover:bg-slate-50/60">
                    <td className="py-3 pr-4 font-medium text-slate-900">
                      {host.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {host.alias ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {numberFormatter.format(host.itemCount)}
                    </td>
                  </tr>
                ))}
                {!hostRows.length ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum host ativo retornado para o proxy {proxy.host}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

type StatCardProps = {
  label: string;
  value: number;
  description: string;
};

function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-slate-900">
        {numberFormatter.format(value)}
      </p>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
