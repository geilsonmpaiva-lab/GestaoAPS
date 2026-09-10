import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), demo: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ from: mocks.from }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/modules", async () => import("../modules"));
vi.mock("@/lib/domain/workspace-policy", async () => import("../domain/workspace-policy"));
import { loadDashboardV2, loadModuleDefinitionV2, type WorkspaceContext } from "./workspace";
type Row = Record<string, unknown>;
function query(data: Row[], failure = false) {
  let rows = [...data]; let start = 0; let end = Infinity;
  const chain = {
    select: () => chain,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return chain; },
    is: (key: string, value: unknown) => { rows = rows.filter((row) => (row[key] ?? null) === value); return chain; },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return chain; },
    not: (key: string, _operator: string, values: string) => { rows = rows.filter((row) => !values.slice(1, -1).split(",").includes(String(row[key]))); return chain; },
    lt: (key: string, value: string) => { rows = rows.filter((row) => Boolean(row[key]) && String(row[key]) < value); return chain; },
    order: () => chain,
    range: (from: number, to: number) => { start = from; end = to; return chain; },
    limit: (size: number) => { end = size - 1; return chain; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows.slice(start, end + 1), count: rows.length, error: failure ? { code: "error" } : null }).then(resolve)
  };
  return chain;
}
const workspace: WorkspaceContext = { organizationId: "org", organizationName: "Org", unitId: "a", unitName: "UBS A", userId: "user", userName: "User", userInitials: "US", environmentLabel: "Test", enabledModules: ["indicadores", "melhoria", "protocolos"], uxV2: true, scopes: [], permissions: [] };
const measurements = Array.from({ length: 61 }, (_, id) => ({ id: String(id), organization_id: "org", unit_id: id < 55 ? "a" : "b", indicator_id: "indicator", status: "FORA_META", updated_at: "2026-09-09", competency: "2026-09-01", value: 5 }));
describe("scope-aware list and dashboard reconciliation", () => {
  beforeEach(() => { mocks.demo.mockReturnValue(false); mocks.from.mockImplementation((table: string) => query(table === "measurements" ? measurements : table === "indicators" ? [{ id: "indicator", name: "Indicador institucional", code: "I-1" }] : [])); });
  it("returns total 55 and the final five records on page three", async () => {
    const result = await loadModuleDefinitionV2("indicadores", workspace, { view: "outside", page: "3" });
    expect(result?.pageInfo).toEqual({ page: 3, pageSize: 25, total: 55 });
    expect(result?.records).toHaveLength(5);
    expect(result?.records[0].title).toBe("Indicador institucional");
    expect(result?.records[0].href).toBe("/registros/measurements/50");
  });
  it("dashboard and drill-down reconcile per UBS and organization", async () => {
    for (const [unitId, total] of [["a", 55], ["b", 6], [null, 61]] as const) {
      const scope = { ...workspace, unitId };
      const dashboard = await loadDashboardV2(scope);
      const list = await loadModuleDefinitionV2("indicadores", scope, { view: "outside" });
      expect(dashboard.outside).toBe(total);
      expect(list?.pageInfo?.total).toBe(total);
    }
  });
  it("fails explicitly instead of showing zero on a database error", async () => {
    mocks.from.mockImplementation(() => query([], true));
    await expect(loadDashboardV2(workspace)).rejects.toThrow("Não foi possível atualizar o painel");
    await expect(loadModuleDefinitionV2("indicadores", workspace, {})).rejects.toThrow("Não foi possível carregar");
  });
  it("gives demo meetings navigable stable IDs and filterable statuses", async () => {
    mocks.demo.mockReturnValue(true);
    const scope = { ...workspace, enabledModules: ["reunioes"] };
    const first = await loadModuleDefinitionV2("reunioes", scope, {});
    const again = await loadModuleDefinitionV2("reunioes", scope, { status: "SCHEDULED" });
    expect(first?.records[0].href).toBe("/registros/meetings/00000000-0000-4000-8000-000000000301");
    expect(first?.records.map(row => row.id)).toEqual(again?.records.map(row => row.id));
    expect(first?.records[0].rawStatus).toBe("SCHEDULED");
    expect((await loadModuleDefinitionV2("reunioes", scope, { status: "COMPLETED" }))?.records).toEqual([]);
  });
});
