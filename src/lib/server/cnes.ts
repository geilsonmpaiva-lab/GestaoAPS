import { z } from 'zod';
import { brazilStates, normalizeCnesUnit, type CnesMunicipality, type CnesUnit } from '@/lib/domain/cnes';

export const CNES_SOURCE = 'https://apidadosabertos.saude.gov.br';
export class CnesUnavailable extends Error {
  constructor(message = 'O serviço público do CNES está indisponível. Tente novamente; nenhum cadastro foi alterado.') { super(message); }
}
// Fixed origin and paths; no tokens, private data, or user-provided URLs are sent upstream.
async function publicJson(path: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(`${CNES_SOURCE}${path}`, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    if (!response.ok) throw new CnesUnavailable();
    return await response.json();
  } catch { throw new CnesUnavailable(); }
}
const municipalitiesResponse = z.object({ macrorregiao_regiao_saude_municipios: z.array(z.object({ codigo_municipio: z.string().regex(/^\d{6}$/), codigo_uf: z.string(), municipio: z.string().min(1).max(150) })).max(860) });
export async function fetchCnesMunicipalities(uf: keyof typeof brazilStates): Promise<CnesMunicipality[]> {
  const parsed = municipalitiesResponse.safeParse(await publicJson(`/macrorregiao-e-regiao-de-saude/municipio?sigla_uf=${uf}&limit=860&offset=0`));
  if (!parsed.success || parsed.data.macrorregiao_regiao_saude_municipios.length === 860) throw new CnesUnavailable('A lista de municípios está incompleta ou em formato inesperado. Tente novamente.');
  const result = new Map<string, CnesMunicipality>();
  for (const row of parsed.data.macrorregiao_regiao_saude_municipios) {
    if (row.codigo_uf !== brazilStates[uf] || !row.codigo_municipio.startsWith(brazilStates[uf])) throw new CnesUnavailable('O serviço retornou municípios fora da UF selecionada.');
    result.set(row.codigo_municipio, { code: row.codigo_municipio, name: row.municipio.replace(new RegExp(`^${uf}\\s*-\\s*`), '').trim(), uf });
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
export async function resolveCnesMunicipality(uf: keyof typeof brazilStates, code: string) {
  const municipality = (await fetchCnesMunicipalities(uf)).find(m => m.code === code);
  if (!municipality) throw new CnesUnavailable('Município não localizado na UF selecionada. Atualize a lista.');
  return municipality;
}
export async function fetchCnesPage(municipality: CnesMunicipality, type: '1' | '2', offset: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ codigo_uf: brazilStates[municipality.uf], codigo_municipio: municipality.code, codigo_tipo_unidade: type, status: '1', limit: '20', offset: String(offset) });
  const parsed = z.object({ estabelecimentos: z.array(z.unknown()).max(20) }).safeParse(await publicJson(`/cnes/estabelecimentos?${query}`, signal));
  if (!parsed.success) throw new CnesUnavailable('O CNES retornou um formato inesperado. Nenhum resultado parcial será cadastrado.');
  try {
    const units = parsed.data.estabelecimentos.map(row => normalizeCnesUnit(row, municipality, type));
    if (new Set(units.map(u => u.cnes)).size !== units.length) throw new Error('Duplicidade na fonte.');
    return { units, nextOffset: units.length === 20 ? offset + 20 : null };
  } catch { throw new CnesUnavailable('Dados inconsistentes na resposta do CNES. Revise a fonte antes de cadastrar.'); }
}
export async function findActiveCnesUnits(municipality: CnesMunicipality, type: '1' | '2', selection: string[]): Promise<CnesUnit[]> {
  const wanted = new Set(selection); const found = new Map<string, CnesUnit>(); const seen = new Set<string>();
  const signal = AbortSignal.timeout(40000);
  // The live endpoint uses row offsets (0,20,40...), despite its Swagger saying pages.
  for (let offset = 0; offset < 2000; offset += 20) {
    const page = await fetchCnesPage(municipality, type, offset, signal);
    for (const unit of page.units) {
      if (seen.has(unit.cnes)) throw new CnesUnavailable('A paginação do CNES mudou durante a consulta. Atualize a busca.');
      seen.add(unit.cnes); if (wanted.has(unit.cnes)) found.set(unit.cnes, unit);
    }
    if (found.size === wanted.size) return selection.map(id => found.get(id)!);
    if (page.nextOffset === null) break;
  }
  throw new CnesUnavailable('Um CNES selecionado não consta como ativo neste município e tipo, ou a consulta atingiu seu limite. Atualize a busca; nada foi cadastrado.');
}
