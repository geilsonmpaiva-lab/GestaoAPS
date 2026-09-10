import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCnesMunicipalities, fetchCnesPage, findActiveCnesUnits } from './cnes';
const municipality = { code: '230020', name: 'ACARAU', uf: 'CE' as const };
const row = (id: number) => ({ codigo_cnes: id, nome_fantasia: `UBS ${id}`, codigo_municipio: 230020, codigo_uf: 23, codigo_tipo_unidade: 2 });
function mockResponses(...bodies: unknown[]) { const mock = vi.fn(); bodies.forEach(body => mock.mockResolvedValueOnce(new Response(JSON.stringify(body)))); vi.stubGlobal('fetch', mock); return mock; }
afterEach(() => vi.unstubAllGlobals());
describe('official CNES adapter', () => {
  it('loads UF municipalities and removes the UF label', async () => {
    mockResponses({ macrorregiao_regiao_saude_municipios: [{ codigo_municipio: '230020', codigo_uf: '23', municipio: 'CE - ACARAU' }] });
    expect(await fetchCnesMunicipalities('CE')).toEqual([municipality]);
  });
  it('queries active units with row offsets and no credential header', async () => {
    const fetch = mockResponses({ estabelecimentos: [row(808792)] });
    expect((await fetchCnesPage(municipality, '2', 20)).units[0].cnes).toBe('0808792');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('status=1'); expect(url).toContain('offset=20'); expect(options.headers).toEqual({ Accept: 'application/json' });
  });
  it('scans subsequent pages and returns only the selection', async () => {
    const fetch = mockResponses({ estabelecimentos: Array.from({ length: 20 }, (_, i) => row(i + 1)) }, { estabelecimentos: [row(21)] });
    expect((await findActiveCnesUnits(municipality, '2', ['0000021'])).map(r => r.cnes)).toEqual(['0000021']);
    expect(fetch.mock.calls[1][0]).toContain('offset=20');
  });
  it('rejects repeated pages and missing selected units', async () => {
    const page = { estabelecimentos: Array.from({ length: 20 }, (_, i) => row(i + 1)) };
    mockResponses(page, page);
    await expect(findActiveCnesUnits(municipality, '2', ['0000021'])).rejects.toThrow('paginação');
    mockResponses({ estabelecimentos: [] });
    await expect(findActiveCnesUnits(municipality, '2', ['0000021'])).rejects.toThrow('não consta');
  });
  it('does not expose upstream errors or accept malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private diagnostic')));
    await expect(fetchCnesPage(municipality, '2', 0)).rejects.toThrow('serviço público');
    mockResponses({ estabelecimentos: [row(1), { ...row(2), codigo_municipio: 230030 }] });
    await expect(fetchCnesPage(municipality, '2', 0)).rejects.toThrow('inconsistentes');
  });
});
