"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="center-state"><b>Não foi possível carregar esta área.</b><p>Seus dados locais permanecem preservados.</p><button className="primary-button" onClick={reset}>Tentar novamente</button></main>;
}
