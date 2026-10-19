import { describe, expect, it } from 'vitest';
import { apsV3Enabled, mayOperate } from './aps-policy';
describe('APS rollout and presentation permissions', () => {
  const synthetic = { demo: false, environment: 'staging', vercelEnvironment: 'preview', organizationId: '362db1a9-bfdd-4334-9436-46b1c0117eab', override: 'true' };
  it('allows only the opted-in synthetic Preview and preserves an explicit rollback', () => {
    expect(apsV3Enabled(synthetic)).toBe(true);
    expect(apsV3Enabled({ ...synthetic, override: 'false', enabled: true })).toBe(false);
    expect(apsV3Enabled({ ...synthetic, override: undefined })).toBe(false);
    expect(apsV3Enabled({ ...synthetic, override: undefined, enabled: true })).toBe(true);
    expect(apsV3Enabled({ ...synthetic, vercelEnvironment: 'production' })).toBe(false);
    expect(apsV3Enabled({ ...synthetic, organizationId: 'institutional' })).toBe(false);
    expect(apsV3Enabled({ ...synthetic, environment: undefined })).toBe(false);
  });
  it('does not turn a module, role label or viewing permission into write access', () => {
    expect(mayOperate([{ domain: 'protocolos', operations: ['visualizar'] }], 'protocolos', 'executar')).toBe(false);
    expect(mayOperate([{ domain: 'protocolos', operations: ['executar'] }], 'esf.producao', 'executar')).toBe(false);
    expect(mayOperate([{ domain: '*', operations: ['*'] }], 'protocolos', 'executar')).toBe(true);
  });
});
