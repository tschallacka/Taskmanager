// The shared select (AppSelect) and the team invite role select that uses it (source level): the open list is drawn
// by Nuxt UI, not the browser, and the Admin choice is offered to owners only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('AppSelect renders through USelect with the options, placeholder and disabled state it is given', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /<USelect/)
  assert.match(select, /:items="items"/)
  assert.match(select, /const items = computed<[\s\S]*?>\(\(\) => props\.groups/)
  assert.match(select, /value-key="value"/)
  assert.match(select, /:placeholder="props\.placeholder"/)
  assert.match(select, /:disabled="props\.disabled"/)
  assert.doesNotMatch(select, /<select[\s>]/, 'no native select: its open list does not follow the theme')
})

test('AppSelect lets an option label wrap in the open list: the label itself is not truncated', () => {
  // Nuxt UI gives the item label `truncate` (no wrap, cut with an ellipsis). An item-level class does not reach the label,
  // so the label has to be overridden here.
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /itemLabel: 'whitespace-normal break-words'/)
})

test('AppSelect is 44 px tall at phone width (a touch target), and keeps its normal height from small screens up', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /min-h-11/, 'a 44 px minimum height (Tailwind min-h-11) at phone width')
  assert.match(select, /sm:min-h-0/, 'the 44 px minimum is lifted from the sm breakpoint up')
})

test('the team crews board picker uses AppSelect with its placeholder, and no native select is left in it', () => {
  const crews = read('app/components/TeamCrewsPanel.vue')
  assert.doesNotMatch(crews, /<select[\s>]/, 'the board picker is no longer a native select')
  assert.match(crews, /<AppSelect\s[\s\S]*?data-team-crew-board/)
  assert.match(crews, /placeholder="Pick a board"/)
})

test('the project owner picker uses AppSelect, lists the staff, and hands the owner over on change', () => {
  const general = read('app/components/project-settings/ProjectGeneralSettings.vue')
  assert.doesNotMatch(general, /<select[\s>]/, 'the owner picker is no longer a native select')
  assert.match(general, /<AppSelect\s[\s\S]*?data-owner-select/)
  assert.match(general, /:options="ownerOptions"/)
  assert.match(general, /@update:model-value="changeOwner"/)
  assert.match(general, /const ownerOptions = computed\(\(\) => staff\.value\.map\(person => \(\{ label: person\.name \|\| person\.email, value: person\.id \}\)\)\)/)
})

test('the team rule mode picker uses AppSelect with its two modes, and switches the mode on change', () => {
  const builder = read('app/components/TeamRuleBuilder.vue')
  assert.doesNotMatch(builder, /<select[\s>]/, 'the mode picker is no longer a native select')
  assert.match(builder, /<AppSelect\s[\s\S]*?data-rule-mode/)
  assert.match(builder, /value: 'by_name'/)
  assert.match(builder, /value: 'column_free'/)
  assert.match(builder, /@update:model-value="setModeFromPicker"/)
})

test('the draft task board picker uses AppSelect with the boards as options', () => {
  const draft = read('app/components/DraftTaskModal.vue')
  assert.doesNotMatch(draft, /<select[\s>]/, 'the board picker is no longer a native select')
  assert.match(draft, /<AppSelect\s[\s\S]*?data-draft-project/)
  assert.match(draft, /:options="boardOptions"/)
  assert.match(draft, /const boardOptions = computed\(\(\) => props\.boards\.map\(board => \(\{ label: board\.name, value: board\.id \}\)\)\)/)
})

test('the new custom field type picker uses AppSelect with the four field types', () => {
  const settings = read('app/components/kanban/ProjectSettingsView.vue')
  assert.doesNotMatch(settings, /<select[\s>]/, 'the field type picker is no longer a native select')
  assert.match(settings, /<AppSelect\s[\s\S]*?data-new-field-type/)
  assert.match(settings, /:options="fieldTypeOptions"/)
  assert.match(settings, /const fieldTypeOptions = Object\.entries\(FIELD_TYPE_LABELS\)\.map\(\(\[value, label\]\) => \(\{ label, value \}\)\)/)
})

test('the list view group and sort pickers use AppSelect with their options', () => {
  const list = read('app/components/kanban/ProjectListView.vue')
  assert.doesNotMatch(list, /<select[\s>]/, 'the group and sort pickers are no longer native selects')
  assert.match(list, /<AppSelect\s[\s\S]*?data-list-group/)
  assert.match(list, /<AppSelect\s[\s\S]*?data-list-sort/)
  assert.match(list, /:options="groupOptions"/)
  assert.match(list, /:options="sortOptions"/)
  assert.match(list, /@update:model-value="setGroupBy"/)
  assert.match(list, /@update:model-value="setSortBy"/)
})

test('the secret access pickers (add and edit) use AppSelect with the two access choices', () => {
  const secrets = read('app/components/project-settings/ProjectSecretsSettings.vue')
  assert.doesNotMatch(secrets, /<select[\s>]/, 'the access pickers are no longer native selects')
  assert.match(secrets, /<AppSelect\s[\s\S]*?data-secret-access-input/)
  assert.match(secrets, /<AppSelect\s[\s\S]*?data-secret-edit-access/)
  assert.match(secrets, /:options="accessOptions"/)
  assert.match(secrets, /@update:model-value="setAddAccess"/)
  assert.match(secrets, /@update:model-value="setEditAccess"/)
})

test('the project members pickers (team, row role, add user, add role) use AppSelect and no native select is left', () => {
  const members = read('app/components/project-settings/ProjectMembersSettings.vue')
  assert.doesNotMatch(members, /<select[\s>]/, 'the members pickers are no longer native selects')
  assert.match(members, /<AppSelect\s[\s\S]*?data-members-team-pick/)
  assert.match(members, /<AppSelect\s[\s\S]*?data-member-role-change/)
  assert.match(members, /<AppSelect\s[\s\S]*?data-member-add-user/)
  assert.match(members, /<AppSelect\s[\s\S]*?data-member-add-role/)
  assert.match(members, /@update:model-value="\(value\) => changeRole\(person, value\)"/)
  assert.match(members, /:options="roleOptions"/)
  assert.match(members, /class="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"/, 'on a phone the badge, role and remove sit on their own full-width line under the name, so the name is not squeezed')
})

test('the board share guest role pickers (invite form and each guest row) use AppSelect', () => {
  const share = read('app/components/BoardShare.vue')
  assert.doesNotMatch(share, /<select[\s>]/, 'the guest role pickers are no longer native selects')
  assert.match(share, /<AppSelect\s[\s\S]*?data-share-role/)
  assert.match(share, /<AppSelect\s[\s\S]*?:aria-label="`Role of \$\{guest\.name\}`"/)
  assert.match(share, /:options="guestRoleOptions"/)
  assert.match(share, /@update:model-value="\(value\) => changeGuestRole\(guest, asGuestRole\(value\)\)"/)
})

test('the GitHub settings pickers (link visibility, sync column and visibility, new link and default visibility) use AppSelect', () => {
  const gh = read('app/components/project-settings/ProjectGithubSettings.vue')
  assert.doesNotMatch(gh, /<select[\s>]/, 'the GitHub pickers are no longer native selects')
  for (const hook of ['data-github-repo-visibility-change', 'data-github-sync-column', 'data-github-sync-visibility', 'data-github-repo-visibility', 'data-github-default-visibility']) {
    assert.match(gh, new RegExp(`<AppSelect\\s[\\s\\S]*?${hook}`), `${hook} is an AppSelect`)
  }
  assert.match(gh, /:options="columnOptions\(row\)"/, 'the column picker lists the board columns, plus the draft value when it is not on the board')
  assert.match(gh, /@update:model-value="\(value\) => changeVisibility\(row, value\)"/)
})

test('AppSelect passes a disabled option through to its list', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /disabled\?: boolean/, 'an option may be disabled')
  assert.match(select, /disabled: option\.disabled/, 'the disabled flag reaches the list item')
})

test('the rule step pickers (kind, column, person, visibility, yes or no) use AppSelect and no native select is left', () => {
  const step = read('app/components/kanban/ProjectRuleStep.vue')
  assert.doesNotMatch(step, /<select[\s>]/, 'the rule step pickers are no longer native selects')
  assert.match(step, /<AppSelect\s[\s\S]*?data-step-kind/)
  const valuePickers = step.match(/<AppSelect[^>]*\bdata-step-value\b/g) ?? []
  assert.equal(valuePickers.length, 4, 'column, person (three kinds), visibility and yes or no use AppSelect')
  assert.match(step, /const NONE = '__none__'/, 'an empty choice (nobody, anyone) uses a sentinel, since an item cannot have an empty value')
})

test('the custom field select cell uses AppSelect, keeps its clicks from the row, and reports a cleared value as null', () => {
  const field = read('app/components/kanban/FieldInput.vue')
  assert.doesNotMatch(field, /<select[\s>]/, 'the field select is no longer a native select')
  assert.match(field, /<AppSelect\s[\s\S]*?:data-field-input="field\.name"/)
  assert.match(field, /<span[^>]*@click\.stop[^>]*>\s*<AppSelect/, 'the picker sits in a wrapper that stops the click from reaching the row')
  assert.match(field, /const NONE = '__none__'/, 'the empty choice uses a sentinel, since an item cannot have an empty value')
  assert.match(field, /emit\('change', raw === '' \? null : raw\)/, 'an empty choice still reports null')
})

test('the open list of AppSelect is as wide as its longest label (min-width fit-content), so the labels of a narrow picker (a task panel field at 390 px) are not cut off', () => {
  const select = read('app/components/AppSelect.vue')
  const content = select.match(/content: '([^']*)'/)?.[1] ?? ''
  assert.match(content, /\bmin-w-fit\b/, 'the list grows to its longest label (Shared with customer), whatever the width of its trigger')
  assert.match(content, /max-w-\[calc\(100vw-2rem\)\]/, 'and it still stays inside the screen')
})

test('the open list of AppSelect is drawn above a dialog, so a picker inside a modal (the draft task project) is not hidden under the overlay', () => {
  const select = read('app/components/AppSelect.vue')
  const content = select.match(/content: '([^']*)'/)?.[1] ?? ''
  assert.match(content, /\bz-\[80\]/, 'the list sits above the dialog overlay, which is z-70')
  const draft = read('app/components/DraftTaskModal.vue')
  assert.match(draft, /<AppSelect\s[\s\S]*?data-draft-project/, 'the draft task project picker is an AppSelect, so it gets this')
})

test('the task panel visibility pickers (the drawer and the GitHub link) are as wide as their labels, so Shared with customer is not cut off', () => {
  // These two are Nuxt UI selects (USelect), not AppSelect: each must carry the same list width on its own.
  const pick = path => read(path).match(/<USelect[\s\S]*?:items="visibilityItems"[\s\S]*?\/>/)?.[0] ?? ''
  assert.match(pick('app/components/kanban/TaskDrawer.vue'), /min-w-fit/, 'the drawer visibility list grows to its longest label')
  assert.match(pick('app/components/kanban/TaskGithub.vue'), /min-w-fit/, 'the GitHub visibility list grows to its longest label')
})

test('AppSelect can list options under group headings (a label per group)', () => {
  const select = read('app/components/AppSelect.vue')
  assert.match(select, /groups\?: \{ label: string, options: SelectOption\[\] \}\[\]/, 'an optional list of groups')
  assert.match(select, /type: 'label'/, 'each group is headed by a label item')
})

test('the timesheet task picker uses AppSelect, grouped by project, with no native select', () => {
  const page = read('app/pages/projects/timesheet.vue')
  assert.doesNotMatch(page, /<select[\s>]/, 'the task picker is no longer a native select')
  assert.doesNotMatch(page, /<optgroup/, 'no native option groups')
  assert.match(page, /<AppSelect\s[\s\S]*?data-ts-task/)
  assert.match(page, /:groups="taskPickerGroups"/)
  assert.match(page, /@update:model-value="\(value\) => taskId = value \?\? ''"/)
})

test('the team invite role select uses AppSelect, and Admin is offered to owners only', () => {
  const invites = read('app/components/TeamInvitesPanel.vue')
  assert.doesNotMatch(invites, /<select[\s>]/, 'the role select is no longer a native select')
  assert.match(invites, /<AppSelect\s[\s\S]*?data-invite-role/)
  assert.match(invites, /\{ label: 'Member', value: 'member' \}/)
  assert.match(invites, /\.\.\.\(props\.isOwner \? \[\{ label: 'Admin', value: 'admin' \}\] : \[\]\)/)
})
