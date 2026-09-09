import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ModuleView } from "@/components/module-view";
import { modules } from "@/lib/modules";
import { loadModuleDefinition, loadWorkspaceContext } from "@/lib/server/workspace";

export function generateStaticParams() {
  return Object.keys(modules).map((module) => ({ module }));
}

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<{ search?: string; status?: string; domain?: string; responsibleId?: string; view?: string }> }) {
  const { module: slug } = await params;
  const filters = await searchParams;
  const search = filters.search ?? "";
  const workspace = await loadWorkspaceContext();
  const definition = await loadModuleDefinition(slug, workspace.organizationId, workspace.unitId, filters);
  if (!definition) notFound();
  return <AppShell workspace={workspace}><ModuleView module={definition} initialQuery={search} organizationId={workspace.organizationId} unitId={workspace.unitId} /></AppShell>;
}
