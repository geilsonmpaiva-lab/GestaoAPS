/** Transcription dictionary, not a clinical guideline. Source: ESF-.pdf, pages 1–10. */
export type EsfField = {
  key: string; label: string; sourceLabel: string;
  type: 'text' | 'date' | 'integer' | 'decimal' | 'select' | 'reference' | 'attachment' | 'calculated';
  group: string; unit?: string; options?: string[]; review?: string;
};
export type EsfTemplate = {
  id: string; title: string; page: number; version: 1; phase: 1 | 2 | 3;
  sensitive: boolean; reviewer: 'gerente' | 'pessoas' | 'caf' | 'vigilancia';
  flag: string; approval: 'DRAFT'; fields: EsfField[]; pending: string[];
};
function fields(group: string, type: EsfField['type'], items: [string, string][]): EsfField[] {
  return items.map(([key, label]) => ({ key, label, sourceLabel: label, type, group }));
}
export const commonEsfFields: EsfField[] = [
  ...fields('Identificação', 'reference', [['unitId', 'Unidade'], ['teamId', 'ESF / PSF']]),
  ...fields('Identificação', 'date', [['occurredOn', 'Data do registro']]),
  ...fields('Identificação', 'calculated', [['competency', 'Mês / Ano'], ['responsible', 'Responsável pelo preenchimento']]),
];
const stockFields = [
  ...fields('Item', 'reference', [['itemId', 'Item / Apresentação'], ['batchId', 'Lote']]),
  ...fields('Item', 'date', [['expiresOn', 'Validade']]),
  ...fields('Movimentação', 'decimal', [['entry', 'Entrada'], ['exit', 'Saída']]),
  ...fields('Saldo', 'calculated', [['previousBalance', 'Saldo anterior'], ['currentBalance', 'Saldo atual']]),
];
export const esfTemplates: EsfTemplate[] = [
  { id: 'producao', title: 'Produção consolidada', page: 1, version: 1, phase: 1, sensitive: false, reviewer: 'gerente', flag: 'esf.producao', approval: 'DRAFT',
    fields: [...fields('Produção diária', 'reference', [['procedureId', 'Código / Descrição / Categoria']]), ...fields('Produção diária', 'integer', [['quantity', 'Quantidade']]), ...fields('Consolidação', 'calculated', [['months', 'JAN a DEZ'], ['total', 'TOTAL']])],
    pending: ['Validar os 25 procedimentos, seus códigos e categorias. Códigos repetidos não identificam uma linha de forma única.'] },
  { id: 'frequencia', title: 'Frequência de servidores', page: 2, version: 1, phase: 2, sensitive: true, reviewer: 'pessoas', flag: 'esf.frequencia', approval: 'DRAFT',
    fields: [...fields('Servidor', 'reference', [['professionalId', 'Servidor(a)']]), ...fields('Vínculo', 'text', [['registration', 'Cadastro / Matrícula'], ['position', 'Cargo'], ['function', 'Função'], ['secondment', 'Cedido de outra secretaria'], ['level', 'Nível cargo / comissão']]), ...fields('Vínculo', 'decimal', [['hours', 'CCH de trabalho']]), ...fields('Vínculo', 'select', [['employmentStatus', 'Efetivo / Est. prob. / Temp. / Car. com.'], ['shift', 'Manhã / Tarde / Noite']]), ...fields('Frequência diária', 'select', [['attendance', 'Ocorrência de frequência']]), ...fields('Frequência diária', 'text', [['notes', 'Observação']]), ...fields('Consolidação', 'calculated', [['absences', 'Faltas']]), ...fields('Conferência', 'reference', [['informationOwner', 'Responsável pela informação'], ['unitSecretary', 'Secretário da unidade administrativa'], ['planningSecretary', 'Secretária de planejamento, controle e ouvidoria']]), ...fields('Conferência', 'date', [['reviewDate', 'Data']])],
    pending: ['Confirmar CCH, cessão e abreviações da situação funcional.', 'Aprovar regras de contagem de faltas e carga horária. Não é folha nem ponto eletrônico.'] },
  { id: 'hanseniase', title: 'Acompanhamento de hanseníase', page: 3, version: 1, phase: 3, sensitive: true, reviewer: 'vigilancia', flag: 'esf.hanseniase', approval: 'DRAFT',
    fields: [...fields('Caso', 'text', [['notificationNumber', 'NOT SINAN'], ['name', 'Nome'], ['residenceCity', 'Município de residência']]), ...fields('Caso', 'date', [['notificationDate', 'Data NOT'], ['lastAttendance', 'Último compar.']]), ...fields('Acompanhamento', 'integer', [['examinedContacts', 'Contatos examinados']]), ...fields('Acompanhamento', 'select', [['classification', 'Classificação operacional atual'], ['disability', 'Grau de incapacidade física'], ['dischargeType', 'Tipo de alta']]), ...fields('Acompanhamento', 'date', [['assessmentDate', 'Data da avaliação da incapacidade'], ['dischargeDate', 'Data da alta']]), ...fields('Conferência', 'reference', [['technicalOwner', 'Técnico responsável']])],
    pending: ['Aprovar classificações, graus, tipos de alta e significado de último comparecimento.'] },
  { id: 'tuberculose', title: 'Acompanhamento de tuberculose', page: 4, version: 1, phase: 3, sensitive: true, reviewer: 'vigilancia', flag: 'esf.tuberculose', approval: 'DRAFT',
    fields: [...fields('Caso', 'text', [['name', 'Nome']]), ...fields('Caso', 'date', [['notificationDate', 'Data da notificação']]), ...fields('Baciloscopia', 'select', Array.from({ length: 6 }, (_, i) => [`smear${i + 1}`, `${i + 1}º mês`] as [string, string])), ...fields('Acompanhamento', 'date', [['treatmentChangedOn', 'Data de mudança de TTO'], ['closedOn', 'Data ENC']]), ...fields('Acompanhamento', 'integer', [['examinedContacts', 'Nº contatos examinados']]), ...fields('Acompanhamento', 'select', [['status9', 'Situação 9º mês'], ['status12', 'Situação 12º mês'], ['closureStatus', 'SIT ENC'], ['sputumCulture', 'Cultura escarro'], ['otherCulture', 'Cultura outro material'], ['hiv', 'HIV'], ['histopathology', 'HISTOP'], ['observedTreatment', 'TDO']])],
    pending: ['Definir a referência temporal dos meses de acompanhamento.', 'Validar opções por exame: STB/NSTB são específicos do histopatológico no documento.', 'Aprovar situações de acompanhamento e encerramento.'] },
  { id: 'nascidos-vivos', title: 'Nascidos vivos', page: 5, version: 1, phase: 3, sensitive: true, reviewer: 'vigilancia', flag: 'esf.nascidos_vivos', approval: 'DRAFT',
    fields: [...fields('Território', 'text', [['segment', 'Segmento'], ['area', 'Área'], ['familyNumber', 'SIAB — Nº da família']]), ...fields('Dados da mãe', 'text', [['motherName', 'Nome'], ['address', 'Endereço'], ['residenceCity', 'Município de residência']]), ...fields('Dados da criança', 'select', [['sex', 'Sexo'], ['birthPlace', 'Parto: Hosp / Dom']]), { key: 'weight', label: 'Peso', sourceLabel: 'Peso', type: 'decimal', group: 'Dados da criança', review: 'Unidade de peso pendente de aprovação' }, ...fields('Dados da criança', 'date', [['birthDate', 'Data nascimento']]), ...fields('Dados da criança', 'text', [['occurrenceCity', 'Município de ocorrência']]), ...fields('Responsável', 'reference', [['agentId', 'ACS']])],
    pending: ['Aprovar unidade do peso e opções de sexo. Não acrescentar identificação da criança ausente no papel.'] },
  { id: 'obitos', title: 'Óbitos', page: 6, version: 1, phase: 3, sensitive: true, reviewer: 'vigilancia', flag: 'esf.obitos', approval: 'DRAFT',
    fields: [...fields('Identificação', 'text', [['name', 'Nome'], ['declarationNumber', 'Nº da D.O.'], ['address', 'Endereço']]), ...fields('Datas', 'date', [['birthDate', 'Data do nascimento'], ['deathDate', 'Data do óbito']]), ...fields('Idade alternativa ao nascimento', 'integer', [['age', 'Idade']]), { key: 'ageUnit', label: 'Unidade da idade', sourceLabel: 'Idade', type: 'select', group: 'Idade alternativa ao nascimento', options: ['Dias', 'Meses', 'Anos'] }, ...fields('Ocorrência', 'text', [['place', 'Local da ocorrência'], ['city', 'Município de ocorrência']]), ...fields('Responsável', 'reference', [['agentId', 'Agente de saúde']])],
    pending: ['Aprovar minimização, retenção e acesso ao acompanhamento nominal.'] },
  { id: 'testes-rapidos', title: 'Atividades de testes rápidos', page: 7, version: 1, phase: 2, sensitive: false, reviewer: 'caf', flag: 'esf.testes_rapidos', approval: 'DRAFT',
    fields: [...fields('Serviço', 'select', [['serviceType', 'Atenção básica / Maternidade / SAE / Outro']]), ...fields('Serviço', 'text', [['regional', 'CRES / Município'], ['contact', 'Contato'], ['sisloglab', 'Nome do serviço SISLOGLAB']]), ...stockFields, ...fields('Utilização', 'integer', [['pregnancyUse', 'Saídas Rede Cegonha'], ['otherUse', 'Saídas Outros'], ['losses', 'Perdas'], ['reactive', 'Total resultado reagente'], ['resupply', 'Ressuprimento']]), ...fields('Utilização', 'text', [['lossReason', 'Justificativa de perda']])],
    pending: ['Conciliar a numeração das notas com as colunas.', 'Validar kits, apresentações e contagem de resultados T1/T2.', 'Prazo impresso de envio não está habilitado como regra.'] },
  { id: 'medicamentos', title: 'Movimento de medicamentos', page: 8, version: 1, phase: 2, sensitive: false, reviewer: 'caf', flag: 'esf.medicamentos', approval: 'DRAFT',
    fields: [...stockFields, ...fields('Entradas', 'decimal', [['pharmacyEntry', 'Entrada UNID. A.F.'], ['otherEntry', 'Entrada outros']]), ...fields('Saídas', 'decimal', [['dispensed', 'DISPEN.'], ['transferred', 'REMAN.'], ['losses', 'PERDA']]), ...fields('Demanda', 'decimal', [['served', 'Demanda atendida'], ['unserved', 'Demanda não atendida'], ['authorized', 'Liberado pela unidade de assistência farmacêutica']]), ...fields('Demanda', 'calculated', [['totalDemand', 'Total de demanda']]), ...fields('Conferência', 'date', [['analyzedOn', 'Analisado'], ['checkedOn', 'Conferido']]), ...fields('Conferência', 'reference', [['pharmacistId', 'Farmacêutico responsável'], ['managerId', 'Gerente da unidade']])],
    pending: ['Validar o catálogo parcial de 30 medicamentos e apresentações.', 'Definir unidade das métricas de demanda; preservar múltiplos lotes/validades.'] },
  { id: 'materiais', title: 'Material médico-hospitalar', page: 9, version: 1, phase: 2, sensitive: false, reviewer: 'caf', flag: 'esf.materiais', approval: 'DRAFT',
    fields: [...stockFields, ...fields('Solicitação', 'decimal', [['unserved', 'D.N.AT.'], ['authorized', 'AUTORIZ.']]), ...fields('Solicitação', 'text', [['notes', 'Observações']]), ...fields('Conferência', 'reference', [['reviewerId', 'Analisado por']]), ...fields('Conferência', 'date', [['analyzedOn', 'Data']])],
    pending: ['Itens 1–48 não foram fornecidos; preservar numeração original 49–88.', 'Confirmar D.N.AT. e unidade das quantidades.'] },
  { id: 'insulinas', title: 'Insulinas e insumos', page: 10, version: 1, phase: 3, sensitive: true, reviewer: 'caf', flag: 'esf.insulinas', approval: 'DRAFT',
    fields: [...fields('Paciente', 'text', [['patientName', 'Paciente'], ['address', 'Endereço']]), ...fields('Paciente', 'date', [['birthDate', 'DN']]), { key: 'diabetesType', label: 'D.M. Tipo I / II', sourceLabel: 'D.M. TIPO I/II', type: 'select', group: 'Paciente', options: ['I', 'II'] }, ...fields('NPH', 'decimal', [['nphUnits', 'UNID DIA'], ['nphQuantity', 'QUANTIDADE FRS/CAN']]), ...fields('Regular', 'decimal', [['regularUnits', 'UNID DIA'], ['regularQuantity', 'QUANTIDADE FRS/CAN']]), ...fields('Entrega', 'reference', [['batchId', 'Lote e apresentação']]), ...fields('Entrega', 'date', [['deliveredOn', 'Data entrega']]), ...fields('Entrega', 'attachment', [['receiptId', 'Comprovante assinado pelo paciente']]), ...stockFields.map(f => ({ ...f, key: `supply_${f.key}`, group: 'Agulhas / Lancetas / Seringas / Tiras' })), ...fields('Estoque de insulinas', 'calculated', [['nphVials', 'NPH frasco'], ['nphPens', 'NPH caneta'], ['regularVials', 'Regular frasco'], ['regularPens', 'Regular caneta']]), ...fields('Ressuprimento CAF', 'decimal', [['resupplyNphVials', 'NPH frasco'], ['resupplyNphPens', 'NPH caneta'], ['resupplyRegularVials', 'Regular frasco'], ['resupplyRegularPens', 'Regular caneta'], ['resupplySupplies', 'Insumos']]), ...fields('Conferência', 'text', [['notes', 'OBS']]), ...fields('Conferência', 'reference', [['unitOwner', 'Responsável UBS / ESF'], ['cafOwner', 'Responsável atendimento CAF']])],
    pending: ['Aprovar apresentações, comprovantes e acesso nominal.', 'Unidades diárias são transcrição, nunca recomendação de dose.', 'Prazo impresso de entrega à CAF permanece inativo.'] },
];

/** Raw codes from the scan, intentionally not normalized or represented as current SIGTAP. */
export const productionProcedures = [
  ['med-consulta', '301010064', 'Consulta médica'], ['med-visita', '301010137', 'Visita domiciliar — médico'],
  ['med-puericultura', '301010080', 'Consulta médica — puericultura'], ['med-puerperio', '301010129', 'Consulta médica — puerpério'],
  ['med-prenatal', '301010110', 'Consulta médica — pré-natal'], ['enf-consulta', '301010030', 'Consulta de enfermagem'],
  ['enf-visita', '301010137', 'Visita domiciliar — enfermagem'], ['enf-puericultura', '301010080', 'Enfermagem — puericultura'],
  ['enf-puerperio', '301010129', 'Enfermagem — puerpério'], ['enf-prenatal', '301010110', 'Enfermagem — pré-natal'],
  ['educ-enf', '101010010', 'Atividade educativa — enfermeiro'], ['educ-aux', '101010010', 'Atividade educativa — auxiliar de enfermagem'],
  ['educ-med', '101010010', 'Atividade educativa — médico'], ['educ-acs', '101010010', 'Atividade educativa — ACS'],
  ['acs-visita', '101030010', 'Visita domiciliar — ACS'], ['medio-domicilio', '301050058', 'Atendimento domiciliar — nível médio'],
  ['medicamento', '301100020', 'Atendimento de medicamento'], ['pressao', '301100039', 'Aferição de pressão arterial'],
  ['inalacao', '301100101', 'Inalação / nebulização'], ['pontos', '301100152', 'Retirada de pontos'],
  ['reidratacao', '301100187', 'Terapia de reidratação oral'], ['curativo', '401010023', 'Curativo'],
  ['citopatologico', '201020033', 'Coleta de exame citopatológico'], ['neonatal', '201020050', 'Coleta para triagem neonatal'],
  ['glicemia', '214010015', 'Glicemia capilar'],
].map(([id, code, label]) => ({ id, code, label }));
