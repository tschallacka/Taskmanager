// Filing projects under a customer, without moving one silently from another customer. A project can sit under one
// customer only, so a project already under another is refused, and the message says where to remove it first.

export interface FilingRow {
  id: string
  name: string
  customerId: string | null
  customerName: string | null
}

/** The projects that are already under a different customer than the one being filed for. */
export function takenByOther(customerId: string, rows: FilingRow[]): FilingRow[] {
  return rows.filter(row => row.customerId !== null && row.customerId !== customerId)
}

export function takenMessage(row: FilingRow): string {
  return `${row.name} is already shared with ${row.customerName ?? 'another customer'}: remove it from there first.`
}
