'use client';
export function EsfPrintControls() {
  return <nav className="esf-print-controls" aria-label="Impressão do formulário"><button type="button" onClick={() => window.print()}>Imprimir / salvar PDF preenchido</button><p>Confira os dados e selecione “Salvar como PDF”. Não utilizar para dados reais. O relatório pode ocupar mais de uma página para manter a legibilidade.</p></nav>;
}
