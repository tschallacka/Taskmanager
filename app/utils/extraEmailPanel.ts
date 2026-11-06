// What the extra email addresses panel shows, kept as plain values so the rules can be tested without a browser.
// The link on the confirm page points at the same anchor the panel carries on Settings.
export const EXTRA_EMAILS_ANCHOR = 'extra-emails'
export const EXTRA_EMAILS_LINK = `/settings#${EXTRA_EMAILS_ANCHOR}`
export const NO_MAIL_NOTICE = 'This instance cannot send mail, so an extra address cannot be confirmed here. Ask the person who runs it to set up mail.'

/** The add form is offered only once the server has said that mail can be sent. Until it answers, nothing is offered. */
export function canAddExtraEmail(mailEnabled: boolean | null): boolean {
  return mailEnabled === true
}
