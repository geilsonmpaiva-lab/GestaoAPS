import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ createSupabaseServerClient: vi.fn() }));
import { epidemiologyEnabled } from './epidemiology';
import type { WorkspaceContext } from './workspace';
import { epiOrganization } from '@/lib/epidemiology';
afterEach(() => vi.unstubAllEnvs());
it('requires staging, non-production deployment and synthetic scope', () => {
 const workspace = { organizationId: epiOrganization, unitId: 'unit' } as WorkspaceContext;
 vi.stubEnv('SGC_ENVIRONMENT', 'staging'); vi.stubEnv('VERCEL_ENV', 'preview'); expect(epidemiologyEnabled(workspace)).toBe(true);
 vi.stubEnv('VERCEL_ENV', 'production'); expect(epidemiologyEnabled(workspace)).toBe(false);
 vi.stubEnv('VERCEL_ENV', 'preview'); expect(epidemiologyEnabled({ ...workspace, organizationId: 'other' })).toBe(false); expect(epidemiologyEnabled({ ...workspace, unitId: null })).toBe(false);
 vi.stubEnv('SGC_ENVIRONMENT', 'production'); expect(epidemiologyEnabled(workspace)).toBe(false);
});
