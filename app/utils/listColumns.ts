// The column widths of the List view, in one place. The table's header row and the cells of each row both read them,
// so a name in the header sits over its value. Changing a width changes both.

export const LIST_CELL_WIDTH = {
  assignee: 'w-28',
  due: 'w-28',
  labels: 'w-40',
  time: 'w-16'
} as const

export type MetaColumn = keyof typeof LIST_CELL_WIDTH

// The order the row draws the optional cells in, and the header names them in. Labels come before Time, as the design has it.
export const META_ORDER: readonly MetaColumn[] = ['assignee', 'due', 'labels', 'time']

export const META_LABEL: Record<MetaColumn, string> = {
  assignee: 'Assignee',
  due: 'Due',
  labels: 'Labels',
  time: 'Time'
}

export const FIELD_WIDTH: Record<string, string> = { select: 'w-28', number: 'w-20', date: 'w-28', text: 'w-32' }

/** The optional cells that are shown, in row order, with their widths. */
export function metaColumns(shown: Record<MetaColumn, boolean>): { key: MetaColumn, label: string, width: string }[] {
  return META_ORDER.filter(key => shown[key]).map(key => ({ key, label: META_LABEL[key], width: LIST_CELL_WIDTH[key] }))
}

/** The custom field cells, in row order, with their widths. */
export function fieldColumns(fields: { id: string, name: string, type: string }[]): { key: string, label: string, width: string }[] {
  return fields.map(field => ({ key: field.id, label: field.name, width: FIELD_WIDTH[field.type] ?? 'w-32' }))
}
