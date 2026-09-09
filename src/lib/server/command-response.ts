import { NextResponse } from "next/server";

export function commandError(error: { code?: string; message?: string }) {
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "40001" ? 409 : 422;
  const message = status === 409 ? "O registro foi alterado por outra pessoa. Atualize os dados antes de tentar novamente." : error.message || "Não foi possível executar o comando.";
  return NextResponse.json({ error: message, code: error.code }, { status });
}
