"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { CheckCircle2, CirclePlus, Download, Trash2 } from "lucide-react";

type FiveWTwoHItem = {
  id: string;
  what: string;
  why: string;
  where: string;
  when: string;
  who: string;
  how: string;
  howMuch: string;
  status: "em_andamento" | "concluido";
};

const STORAGE_KEY = "noc-dashboard:5w2h";

export const dynamic = "force-dynamic";

export default function FiveWTwoHPage() {
  const [items, setItems] = useState<FiveWTwoHItem[]>([]);
  const [draft, setDraft] = useState<Omit<FiveWTwoHItem, "id" | "status">>({
    what: "",
    why: "",
    where: "",
    when: "",
    who: "",
    how: "",
    howMuch: "",
  });
  const [status, setStatus] = useState<FiveWTwoHItem["status"]>("em_andamento");
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as FiveWTwoHItem[];
        setItems(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  }, [items]);

  const addItem = () => {
    const trimmed = Object.values(draft).every((value) => value.trim().length);
    if (!trimmed) return;
    const newItem: FiveWTwoHItem = {
      id: crypto.randomUUID(),
      ...draft,
      status,
    };
    setItems((prev) => [...prev, newItem]);
    setDraft({
      what: "",
      why: "",
      where: "",
      when: "",
      who: "",
      how: "",
      howMuch: "",
    });
    setStatus("em_andamento");
  };

  const toggleStatus = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: item.status === "concluido" ? "em_andamento" : "concluido",
            }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleExport = async () => {
    if (!tableRef.current || exporting) return;
    try {
      setExporting(true);
      const dataUrl = await toPng(tableRef.current, {
        pixelRatio: 2,
        backgroundColor: "transparent",
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `5w2h-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Falha ao exportar tabela 5W2H", error);
    } finally {
      setExporting(false);
    }
  };

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.status === b.status) return a.what.localeCompare(b.what);
        return a.status === "em_andamento" ? -1 : 1;
      }),
    [items]
  );

  return (
    <main className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 sm:px-6 lg:px-12">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
              NOC 5W2H
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Plano 5W2H das atividades do NOC
            </h1>
            <p className="text-sm text-slate-500">
              Acrescente, acompanhe e exporte o plano de acoes em formato de imagem
              com fundo transparente para usar em apresentacoes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || items.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Gerando..." : "Exportar tabela"}
            </button>
          </div>
        </header>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap">
            <Field
              label="What"
              value={draft.what}
              onChange={(value) => setDraft((prev) => ({ ...prev, what: value }))}
              placeholder="O que sera feito"
            />
            <Field
              label="Why"
              value={draft.why}
              onChange={(value) => setDraft((prev) => ({ ...prev, why: value }))}
              placeholder="Por que"
            />
            <Field
              label="Where"
              value={draft.where}
              onChange={(value) => setDraft((prev) => ({ ...prev, where: value }))}
              placeholder="Onde"
            />
            <Field
              label="When"
              value={draft.when}
              onChange={(value) => setDraft((prev) => ({ ...prev, when: value }))}
              placeholder="Quando"
            />
            <Field
              label="Who"
              value={draft.who}
              onChange={(value) => setDraft((prev) => ({ ...prev, who: value }))}
              placeholder="Responsavel"
            />
            <Field
              label="How"
              value={draft.how}
              onChange={(value) => setDraft((prev) => ({ ...prev, how: value }))}
              placeholder="Como sera feito"
            />
            <Field
              label="How much"
              value={draft.howMuch}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, howMuch: value }))
              }
              placeholder="Quanto custa / esforco"
            />
            <div className="flex w-full flex-col gap-2 lg:w-auto">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Status
              </label>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as FiveWTwoHItem["status"])
                }
                className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluido</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
              >
                <CirclePlus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
          </div>
        </section>

        <section ref={tableRef} className="space-y-3 rounded-3xl bg-transparent">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            Tarefas:{" "}
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              {items.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-transparent shadow-sm">
            <div className="grid grid-cols-8 bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-white">
              <span>What</span>
              <span>Why</span>
              <span>Where</span>
              <span>When</span>
              <span>Who</span>
              <span>How</span>
              <span>How much</span>
              <span className="text-center">Status</span>
            </div>
            <div className="divide-y divide-slate-200 bg-transparent">
              {sortedItems.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  Nenhuma tarefa cadastrada ainda.
                </div>
              ) : (
                sortedItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-8 items-center gap-3 px-4 py-3 text-sm text-slate-800"
                  >
                    <span className="font-semibold text-slate-900">
                      {item.what}
                    </span>
                    <span className="text-slate-600">{item.why}</span>
                    <span className="text-slate-600">{item.where}</span>
                    <span className="text-slate-600">{item.when}</span>
                    <span className="text-slate-600">{item.who}</span>
                    <span className="text-slate-600">{item.how}</span>
                    <span className="text-slate-600">{item.howMuch}</span>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(item.id)}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          item.status === "concluido"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                        }`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {item.status === "concluido" ? "Concluido" : "Em andamento"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-2 lg:w-[calc(50%-0.5rem)] xl:w-[calc(33%-0.5rem)]">
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}
