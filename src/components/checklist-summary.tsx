import { checklistFields } from '@/lib/checklist-presentation';

export function ChecklistSummary({ schema }: { schema: unknown }) {
  const fields = checklistFields(schema);
  return fields.length ? <ol aria-label="Campos do checklist">{fields.map((field, index) => <li key={index}>
    <strong>{field.label}</strong><p>Formato: {field.format} · {field.requirement}</p>
  </li>)}</ol> : <p>Nenhum campo configurado neste checklist.</p>;
}
