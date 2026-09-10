'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceContext } from '@/lib/server/workspace';
import type { EsfTeam } from '@/lib/esf/production';
import { EsfTeamAccess } from '@/components/esf-team-access';

export function EsfTeams({ teams, workspace, creating, canCreate, demo }: { teams: EsfTeam[]; workspace: WorkspaceContext; creating: boolean; canCreate: boolean; demo: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [area, setArea] = useState('');
  const [search, setSearch] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; operationId: string; entityId: string } | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      const input = { name, code, area, organizationId: workspace.organizationId, unitId: workspace.unitId };
      const fingerprint = JSON.stringify(input);
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, operationId: crypto.randomUUID(), entityId: crypto.randomUUID() };
      const response = await fetch('/api/v1/esf/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, operationId: pending.current.operationId, entityId: pending.current.entityId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível cadastrar a equipe.');
      if (result.mode === 'demo') { setMessage('Cadastro simulado. Nenhuma equipe foi gravada no servidor.'); return; }
      router.push('/administracao/equipes'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao cadastrar. Os campos foram preservados.'); }
    finally { setBusy(false); }
  }
  return <><header className="module-heading"><div><p className="eyebrow">{workspace.unitName}</p><h1 className="page-title">{creating ? 'Cadastrar equipe ESF' : 'Equipes ESF'}</h1><p className="v2-muted">Equipes pertencem a uma UBS. O estoque permanece compartilhado pela unidade.</p></div>{!creating && canCreate && <Link className="v2-button" href="/administracao/equipes/novo">Nova equipe</Link>}</header>
    {demo && <p className="v2-alert">Ambiente de demonstração. Cadastros não são persistidos.</p>}
    {creating ? <section className="v2-panel">{!canCreate ? <p role="alert">Selecione uma UBS e um perfil com permissão para cadastrar equipes.</p> : <form onSubmit={save} className="esf-entry"><label className="v2-field"><span>Nome da equipe</span><input required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label><label className="v2-field"><span>Identificação institucional</span><input required maxLength={40} value={code} onChange={e => setCode(e.target.value)} /></label><label className="v2-field"><span>Área de atuação</span><input maxLength={160} value={area} onChange={e => setArea(e.target.value)} /></label><button className="v2-button" disabled={busy}>{busy ? 'Cadastrando…' : 'Cadastrar equipe'}</button></form>}<p role="status">{message}</p><Link className="v2-secondary" href="/administracao/equipes">Voltar às equipes</Link></section> : <section className="v2-panel"><label className="v2-field"><span>Pesquisar equipe</span><input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} /></label><div className="v2-records">{teams.filter(t => `${t.name} ${t.code} ${t.area}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(team => <article className="v2-record" key={team.id}><div><h2>{team.name}</h2><p>{team.code} · {team.area || 'Área não informada'}</p><p>{team.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</p></div><Link className="v2-secondary" href={`/formularios-esf/producao?team=${team.id}`}>Abrir produção</Link></article>)}</div>{!teams.length && <p>Nenhuma equipe disponível nesta UBS. Cadastre a primeira equipe para iniciar a produção.</p>}</section>}
    {!creating && canCreate && teams.map(team => <section className="v2-panel v2-section" key={team.id}><h2>Acessos · {team.name}</h2><EsfTeamAccess teamId={team.id} workspace={workspace} /></section>)}
    <div className="dialog-actions"><Link className="v2-secondary" href="/administracao">Administração</Link><Link className="v2-secondary" href="/formularios-esf">Formulários ESF</Link></div>
  </>;
}
