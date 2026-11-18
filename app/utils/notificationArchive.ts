// Archive all, as the page means it. Under the Unread filter it archives only the unread rows, which are the ones that
// filter shows; under All or the Read box it archives every inbox row. Pure, so the page's behaviour is tested without
// the page (tests/notifications-unread-archive-page.test.ts).

export type InboxFilter = 'all' | 'unread' | 'readbox'

/** The body of the archive request for Archive all under the given filter. */
export function archiveAllRequest(filter: InboxFilter): { all: true, unreadOnly: boolean } {
  return { all: true, unreadOnly: filter === 'unread' }
}

/** The rows the list keeps after Archive all: under the Unread filter the read rows (the filter does not show them). */
export function keptAfterArchiveAll<T extends { readAt: number | null }>(items: T[], unreadOnly: boolean): T[] {
  return unreadOnly ? items.filter(item => item.readAt) : []
}
