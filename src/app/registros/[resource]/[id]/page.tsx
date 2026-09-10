import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RecordDetail } from "@/components/record-detail";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { loadRecordDetail, detailResources } from "@/lib/server/record-detail";
import { requireActor } from "@/lib/server/supabase";

export default async function RecordPage({ params, searchParams }: { params: Promise<{ resource: string; id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { resource, id } = await params;
  if (!await requireActor()) redirect("/login");
  const workspace = await loadWorkspaceContext();
  const moduleSlug = detailResources[resource]?.module;
  if (!moduleSlug || !workspace.uxV2 || !workspace.enabledModules.includes(moduleSlug)) notFound();
  const detail = await loadRecordDetail(resource, id, workspace);
  if (!detail) notFound();
  const requestedReturn = (await searchParams).returnTo;
  const returnTo = requestedReturn && /^\/(?!\/)/.test(requestedReturn) && !/[\\\r\n]/.test(requestedReturn) ? requestedReturn : `/${moduleSlug}`;
  return <AppShell workspace={workspace}><RecordDetail detail={detail} workspace={workspace} returnTo={returnTo} /></AppShell>;
}
