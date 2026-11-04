// The plain words for each kind of rule step and how a step's one value is stored.
// The board rule builder and the team rule builder both read this, so they offer the
// same kinds in the same words. A team rule stores a column by NAME, so the stored
// key of a column step is chosen by the caller (columnId on a board, columnName for a team).

export type StepField = 'none' | 'column' | 'person' | 'personOrNobody' | 'personOrAnyone' | 'label' | 'days' | 'text' | 'visibility' | 'yesNo'
export interface KindInfo { label: string, field: StepField, key?: string }
export interface Row { kind: string, value: string }

export const TRIGGERS: Record<string, KindInfo> = {
  task_added: { label: 'A task is added', field: 'none' },
  task_moved: { label: 'A task is moved to a column', field: 'column', key: 'columnId' },
  task_completed: { label: 'A task is completed', field: 'none' },
  task_reopened: { label: 'A task is reopened', field: 'none' },
  task_assigned: { label: 'A task is assigned to someone', field: 'personOrAnyone', key: 'assigneeId' },
  due_set: { label: 'A due date is set or changed', field: 'none' },
  due_passed: { label: 'A due date passes', field: 'none' },
  comment_added: { label: 'A comment is added', field: 'none' },
  pr_merged: { label: 'A linked pull request is merged', field: 'none' },
  pr_closed: { label: 'A linked pull request is closed', field: 'none' },
  pr_checks_failed: { label: 'Checks fail on a linked pull request', field: 'none' }
}

export const CONDITIONS: Record<string, KindInfo> = {
  in_column: { label: 'The task is in a column', field: 'column', key: 'columnId' },
  assigned_to: { label: 'It is assigned to someone, or to nobody', field: 'personOrNobody', key: 'assigneeId' },
  has_label: { label: 'It has a label', field: 'label', key: 'label' },
  has_due_date: { label: 'It has a due date (yes or no)', field: 'yesNo', key: 'value' },
  visibility: { label: 'It is team only or shared with customer', field: 'visibility', key: 'value' }
}

export const ACTIONS: Record<string, KindInfo> = {
  move_to_column: { label: 'Move it to a column', field: 'column', key: 'columnId' },
  assign: { label: 'Assign it to someone', field: 'person', key: 'assigneeId' },
  unassign: { label: 'Unassign it', field: 'none' },
  set_due_in_days: { label: 'Set the due date, days from now', field: 'days', key: 'days' },
  complete: { label: 'Mark it complete', field: 'none' },
  reopen: { label: 'Reopen it', field: 'none' },
  add_label: { label: 'Add a label', field: 'label', key: 'label' },
  add_comment: { label: 'Add a comment', field: 'text', key: 'text' },
  create_subtask: { label: 'Create a subtask', field: 'text', key: 'title' },
  set_visibility: { label: 'Set it team only or shared with customer', field: 'visibility', key: 'value' }
}

export const NO_KIND: KindInfo = { label: '', field: 'none' }

/** The kinds a select offers. `disabled` marks kinds this caller may not pick, with `disabledNote` appended to the label. */
export function kindList(table: Record<string, KindInfo>, disabled: (kind: string) => boolean = () => false, disabledNote = '') {
  return Object.entries(table).map(([value, info]) => ({
    value,
    label: disabled(value) && disabledNote ? `${info.label} (${disabledNote})` : info.label,
    field: info.field,
    disabled: disabled(value)
  }))
}

// The key a step's value is stored under; a column step uses `columnKey`.
function keyOf(info: KindInfo, columnKey: string): string | undefined {
  return info.field === 'column' ? columnKey : info.key
}

// Rows are edited as text; each kind turns its value into the stored shape.
export function fromStored(item: Record<string, unknown>, info: KindInfo, columnKey = 'columnId'): Row {
  const kind = String(item.kind)
  const key = keyOf(info, columnKey)
  if (!key) return { kind, value: '' }
  const raw = item[key]
  if (info.field === 'yesNo') return { kind, value: raw === true ? 'yes' : raw === false ? 'no' : '' }
  if (info.field === 'days') return { kind, value: raw === undefined ? '' : String(raw) }
  return { kind, value: typeof raw === 'string' ? raw : '' }
}

export function toStored(row: Row, info: KindInfo, columnKey = 'columnId'): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: row.kind }
  const key = keyOf(info, columnKey)
  if (!key) return out
  switch (info.field) {
    case 'personOrNobody':
      out[key] = row.value === '' ? null : row.value
      break
    case 'personOrAnyone':
      // An empty value is the choice "anyone", which the model reads as no key.
      if (row.value !== '') out[key] = row.value
      break
    case 'days':
      out[key] = row.value === '' ? row.value : Number(row.value)
      break
    case 'yesNo':
      out[key] = row.value === 'yes' ? true : row.value === 'no' ? false : ''
      break
    default:
      out[key] = row.value.trim()
  }

  return out
}
