import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ModuleView } from "@/components/module-view";
import { modules } from "@/lib/modules";
import { loadModuleDefinition, loadModuleDefinitionV2, loadWorkspaceContext, type ModuleFilters } from "@/lib/server/workspace";
import { ModuleListV2 } from "@/components/module-list-v2";

export function generateStaticParams() {
  return Object.keys(modules).map((module) => ({ module }));
}

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<ModuleFilters> }) {
  const { module: slug } = await params;
  const filters = await searchParams;
  const search = filters.search ?? "";
  const workspace = await loadWorkspaceContext();
  const definition = workspace.uxV2 ? await loadModuleDefinitionV2(slug, workspace, filters) : await loadModuleDefinition(slug, workspace.organizationId, workspace.unitId, filters);
  if (!definition) notFound();
  return <AppShell workspace={workspace}>{workspace.uxV2 ? <ModuleListV2 module={definition} workspace={workspace} filters={filters} /> : <ModuleView module={definition} initialQuery={search} organizationId={workspace.organizationId} unitId={workspace.unitId} />}</AppShell>;
}
