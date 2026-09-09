import Link from "next/link";

export default function NotFound() {
  return <main className="center-state"><b>Página não encontrada</b><p>O conteúdo pode ter sido movido ou você não tem acesso.</p><Link className="primary-button" href="/">Voltar ao painel</Link></main>;
}
