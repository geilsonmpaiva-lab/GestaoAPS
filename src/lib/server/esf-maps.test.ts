import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from './workspace';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { esfMapRpc, syntheticMapsEnabled } from './esf-maps';
const workspace = { organizationId: '362db1a9-bfdd-4334-9436-46b1c0117eab', unitId: 'unit-A' } as WorkspaceContext;
beforeEach(() => { vi.stubEnv('SGC_ENVIRONMENT', 'staging'); vi.stubEnv('VERCEL_ENV', 'preview'); vi.clearAllMocks(); });
it('requires staging, non-production deployment, synthetic organization and active unit', () => {
  expect(syntheticMapsEnabled(workspace)).toBe(true); expect(syntheticMapsEnabled({ ...workspace, unitId: null })).toBe(false); expect(syntheticMapsEnabled({ ...workspace, organizationId: 'other' })).toBe(false);
  vi.stubEnv('VERCEL_ENV', 'production'); expect(syntheticMapsEnabled(workspace)).toBe(false); vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('SGC_ENVIRONMENT', 'production'); expect(syntheticMapsEnabled(workspace)).toBe(false);
});
it('injects server-authorized scope instead of trusting request scope', async () => {
  await esfMapRpc(workspace, { templateId: 'materiais', action: 'list', organizationId: 'forged', unitId: 'forged' });
  expect(mocks.rpc).toHaveBeenCalledWith('staging_esf_maps_v1', { p_request: { templateId: 'materiais', action: 'list', organizationId: workspace.organizationId, unitId: workspace.unitId } });
});
