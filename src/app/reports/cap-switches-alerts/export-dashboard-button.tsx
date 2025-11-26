"use client";

import { toPng } from "html-to-image";
import { useState } from "react";

type Props = {
  targetId: string;
};

export function ExportDashboardButton({ targetId }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    const container = document.getElementById(targetId);
    if (!container || loading) return;

    try {
      setLoading(true);
      const dataUrl = await toPng(container, {
        cacheBust: true,
        pixelRatio: 2,
        quality: 0.95,
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `cap-switches-dashboard-${new Date()
        .toISOString()
        .slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Failed to export dashboard", error);
      alert(
        "Não foi possível gerar a imagem agora. Atualize a página e tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="rounded-2xl border border-purple-200 bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? "Gerando imagem..." : "Exportar imagem"}
    </button>
  );
}
