import { NextResponse } from 'next/server';
import { cnesImportSchema, cnesSearchSchema, ufSchema } from '@/lib/domain/cnes';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadAdminCatalog } from '@/lib/server/admin-registration';
import { requireActor, createSupabaseServerClient, isDemoMode } from '@/lib/server/supabase';
import { CnesUnavailable, CNES_SOURCE, fetchCnesMunicipalities, fetchCnesPage, findActiveCnesUnits, resolveCnesMunicipality } from '@/lib/server/cnes';
import { commandError } from '@/lib/server/command-response';

export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
async function context() {
  if (!await requireActor()) return { denied: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  const workspace = await loadWorkspaceContext();
  const { catalog, error } = await loadAdminCatalog(workspace);
  if (error || !catalog) return { denied: NextResponse.json({ error: 'Não foi possível validar o acesso administrativo. Tente novamente.' }, { status: 503 }) };
  if (!catalog.canCreateUnits) return { denied: NextResponse.json({ error: 'Somente a gestão autorizada da organização pode importar unidades.' }, { status: 403 }) };
  return { workspace, catalog };
}
function providerError(error: unknown) {
  return NextResponse.json({ error: error instanceof CnesUnavailable ? error.message : 'Não foi possível confirmar a resposta. Tente novamente com a mesma seleção para consultar o resultado sem duplicar cadastros.' }, { status: 502, headers });
}
export async function GET(request: Request) {
  const ctx = await context(); if (ctx.denied) return ctx.denied;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if (query.action === 'municipalities') {
      const uf = ufSchema.safeParse(query.uf);
      if (!uf.success) return NextResponse.json({ error: 'UF inválida.' }, { status: 422 });
      return NextResponse.json({ municipalities: await fetchCnesMunicipalities(uf.data), source: CNES_SOURCE }, { headers });
    }
    const parsed = cnesSearchSchema.safeParse(query);
    if (!parsed.success) return NextResponse.json({ error: 'Confira UF, município e CNES (7 dígitos), se informado.' }, { status: 422 });
    const { uf, municipality: code, type, offset, cnes } = parsed.data;
    const municipality = await resolveCnesMunicipality(uf, code);
    const page = cnes ? { units: await findActiveCnesUnits(municipality, type, [cnes]), nextOffset: null } : await fetchCnesPage(municipality, type, offset);
    const registered = new Set(ctx.catalog.units.map(u => u.cnes));
    return NextResponse.json({ ...page, units: page.units.map(u => ({ ...u, alreadyRegistered: registered.has(u.cnes) })), municipality, fetchedAt: new Date().toISOString(), source: CNES_SOURCE, demo: isDemoMode() }, { headers });
  } catch (error) { return providerError(error); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const ctx = await context(); if (ctx.denied) return ctx.denied;
  const parsed = cnesImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Selecione de 1 a 20 CNES distintos e confira o município.' }, { status: 422 });
  if (parsed.data.organizationId !== ctx.workspace.organizationId) return NextResponse.json({ error: 'Organização não autorizada.' }, { status: 403 });
  const { organizationId, operationId, uf, municipality: code, type } = parsed.data;
  const selection = [...parsed.data.selection].sort();
  const args = { p_operation_id: operationId, p_organization_id: organizationId, p_municipality: code, p_uf: uf, p_type: type, p_selection: selection };
  try {
    const client = isDemoMode() ? null : await createSupabaseServerClient();
    // The RPC rechecks authorization even on retries; read-only preflight returns an existing result.
    if (client) {
      const prior = await client.rpc('import_cnes_units', { ...args, p_rows: null });
      if (prior.error) return commandError(prior.error);
      if (prior.data) return NextResponse.json(prior.data, { headers });
    }
    const municipality = await resolveCnesMunicipality(uf, code);
    const units = await findActiveCnesUnits(municipality, type, selection);
    if (!client) {
      const existing = new Map(ctx.catalog.units.map(u => [u.cnes, u]));
      return NextResponse.json({ mode: 'demo', created: units.filter(u => !existing.has(u.cnes)).map(u => ({ cnes: u.cnes, name: u.name, id: u.cnes })), skipped: units.filter(u => existing.has(u.cnes)).map(u => ({ cnes: u.cnes, name: existing.get(u.cnes)!.name, id: existing.get(u.cnes)!.id })) }, { headers });
    }
    const { data, error } = await client.rpc('import_cnes_units', { ...args, p_rows: units });
    return error ? commandError(error) : NextResponse.json(data, { headers });
  } catch (error) { return providerError(error); }
}
