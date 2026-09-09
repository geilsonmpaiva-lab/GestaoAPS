"use client";

import { useEffect } from "react";
import { modules } from "@/lib/modules";

export function WebMcpTools() {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: "search_sgc_records",
      title: "Pesquisar registros do SGC UBS",
      description: "Pesquisa registros gerenciais visíveis no SGC UBS e abre o módulo com o filtro aplicado.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", minLength: 2, maxLength: 120 } },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        const query = typeof input === "object" && input !== null && "query" in input ? String((input as { query: unknown }).query).trim() : "";
        if (query.length < 2 || query.length > 120) throw new Error("Informe uma pesquisa de 2 a 120 caracteres.");
        const normalized = query.toLocaleLowerCase("pt-BR");
        const results = Object.values(modules).flatMap((module) => module.records
          .filter((record) => `${record.title} ${record.meta} ${record.status}`.toLocaleLowerCase("pt-BR").includes(normalized))
          .map((record) => ({ module: module.title, title: record.title, status: record.status, url: `/${module.slug}?search=${encodeURIComponent(query)}` })))
          .slice(0, 10);
        if (results[0]) window.location.assign(results[0].url);
        return { query, count: results.length, results };
      }
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);
  return null;
}
