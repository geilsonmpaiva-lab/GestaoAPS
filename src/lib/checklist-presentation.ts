type ChecklistField = { label: string; format: string; requirement: string };
const formats: Record<string, string> = { text: 'Texto', number: 'Número', boolean: 'Sim ou não' };

/** Display only approved field properties, never serialize arbitrary schema keys. */
export function checklistFields(schema: unknown): ChecklistField[] {
  if (!schema || typeof schema !== 'object' || !('fields' in schema) || !Array.isArray(schema.fields)) return [];
  return schema.fields.map((value: unknown, index: number) => {
    const field = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      label: typeof field.label === 'string' && field.label.trim() ? field.label.trim() : `Campo ${index + 1}`,
      format: typeof field.type === 'string' ? Object.hasOwn(formats, field.type) ? formats[field.type] : 'Formato não reconhecido' : 'Formato não informado',
      requirement: field.required === true ? 'Resposta obrigatória' : field.required === false ? 'Resposta opcional' : 'Obrigatoriedade não informada',
    };
  });
}
