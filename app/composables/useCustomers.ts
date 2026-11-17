export interface Customer {
  id: string
  organizationId: string
  name: string
  createdAt: number
  updatedAt: number
  projectCount: number
  contactCount: number
}

export interface CustomerContact {
  userId: string
  name: string | null
  email: string
  createdAt: number
}

export interface CustomerInvitation {
  id: string
  label: string | null
  /** The address the link is tied to, or null for an anonymous link. */
  email?: string | null
  createdAt: number
  expiresAt: number
}

// Module-level, like useProjects: the project header's customer picker and the
// customers modal read the same list.
const _customers = ref<Customer[]>([])
const _canManage = ref(false)
const _loadedFor = ref<string | null>(null)

/** The active organisation's customers. Empty in the personal workspace. */
export function useCustomers() {
  const { activeTeamId } = useTeams()

  async function refresh() {
    const organizationId = activeTeamId.value
    if (!organizationId) {
      _customers.value = []
      _canManage.value = false
      _loadedFor.value = null
      return
    }
    const res = await $fetch<{ canManage: boolean, customers: Customer[] }>('/api/customers')
    _customers.value = res.customers
    _canManage.value = res.canManage
    _loadedFor.value = organizationId
  }

  /** Loads the list once per organisation; later calls are free. */
  async function ensureLoaded() {
    if (_loadedFor.value !== activeTeamId.value) await refresh()
  }

  async function createCustomer(name: string) {
    const customer = await $fetch<Customer>('/api/customers', { method: 'POST', body: { name } })
    _customers.value = [..._customers.value, customer].sort((a, b) => a.name.localeCompare(b.name))
    return customer
  }

  async function renameCustomer(id: string, name: string) {
    await $fetch(`/api/customers/${id}`, { method: 'PUT', body: { name } })
    _customers.value = _customers.value
      .map(c => c.id === id ? { ...c, name } : c)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function deleteCustomer(id: string) {
    await $fetch(`/api/customers/${id}`, { method: 'DELETE' })
    _customers.value = _customers.value.filter(c => c.id !== id)
  }

  function loadContacts(id: string) {
    return $fetch<{ canManage: boolean, contacts: CustomerContact[], invitations: CustomerInvitation[] }>(
      `/api/customers/${id}/contacts`
    )
  }

  function createInvitation(id: string, label: string, email: string, projectIds: string[]) {
    return $fetch<CustomerInvitation & { url: string }>(`/api/customers/${id}/invitations`, {
      method: 'POST',
      body: { label, email, projectIds }
    })
  }

  async function revokeInvitation(customerId: string, invitationId: string) {
    await $fetch(`/api/customers/${customerId}/invitations/${invitationId}`, { method: 'DELETE' })
  }

  async function removeContact(customerId: string, userId: string) {
    await $fetch(`/api/customers/${customerId}/contacts/${userId}`, { method: 'DELETE' })
    _customers.value = _customers.value
      .map(c => c.id === customerId ? { ...c, contactCount: Math.max(0, c.contactCount - 1) } : c)
  }

  return {
    customers: readonly(_customers),
    canManageCustomers: readonly(_canManage),
    refresh,
    ensureLoaded,
    createCustomer,
    renameCustomer,
    deleteCustomer,
    loadContacts,
    createInvitation,
    revokeInvitation,
    removeContact
  }
}
