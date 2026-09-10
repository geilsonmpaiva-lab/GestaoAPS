import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { CreateMvpRecord } from '@/components/create-mvp-record';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { mvpForms } from '@/lib/mvp-forms';

export default async function CreatePage({params}: {params:Promise<{resource:string}>}) {
  const {resource} = await params;
  const workspace = await loadWorkspaceContext();
  const config = mvpForms[resource];
  if (!config || !workspace.uxV2 || !workspace.enabledModules.includes(config.module)) notFound();
  return <AppShell workspace={workspace}><CreateMvpRecord resource={resource} workspace={workspace} /></AppShell>;
}
