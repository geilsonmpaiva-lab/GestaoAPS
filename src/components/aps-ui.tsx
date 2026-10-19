import Link from 'next/link';
import { ArrowRight, Inbox, AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function ApsPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="aps-page-heading"><div><p className="aps-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
export function ApsCardLink({ href, title, description, icon, label = 'Abrir' }: { href: string; title: string; description: string; icon?: ReactNode; label?: string }) {
  return <Link className="aps-task-card" href={href}>{icon && <span className="aps-task-icon" aria-hidden>{icon}</span>}<h2>{title}</h2><p>{description}</p><span className="aps-task-action">{label}<ArrowRight size={17} aria-hidden /></span></Link>;
}
export function ApsEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="aps-empty"><Inbox size={26} aria-hidden /><h2>{title}</h2><div>{children}</div></div>;
}
export function ApsErrors({ errors }: { errors: string[] }) {
  return errors.length ? <div role="alert" className="aps-error-summary"><AlertCircle size={20} aria-hidden /><div><strong>Algumas informações não puderam ser atualizadas</strong>{errors.map((error, i) => <p key={i}>{error}</p>)}<p>Os resultados indisponíveis não foram substituídos por zero.</p></div></div> : null;
}
