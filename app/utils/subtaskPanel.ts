// The task panel for a subtask (card mw9pjeqbrfw0xknkz3n). A subtask is kept beside the cards, not among them, so the
// address of a subtask finds nothing in the card list alone; and the panel's trail (Parent > Subtask) follows the parent
// links up through both lists. Pure, so the pages and the tests use one rule.

export interface PanelNode {
  id: string
  title: string
  parentTaskId?: string | null
}

// The task an address names: a card first, then a subtask. Null when neither has the id.
export function panelTaskById<T extends PanelNode>(id: string | null | undefined, tasks: T[], subtasks: T[]): T | null {
  if (!id) return null
  return tasks.find(t => t.id === id) ?? subtasks.find(t => t.id === id) ?? null
}

// The chain from the top card down to the task itself: [card, parent, ..., task]. A parent that is not on the board ends
// the chain, and a loop in the parent links ends it too (a task is listed once).
export function panelTrail(task: PanelNode, tasks: PanelNode[], subtasks: PanelNode[]): PanelNode[] {
  const all = [...tasks, ...subtasks]
  const chain: PanelNode[] = [task]
  const seen = new Set<string>([task.id])
  let parentId = task.parentTaskId ?? null
  while (parentId && !seen.has(parentId)) {
    const parent = all.find(t => t.id === parentId)
    if (!parent) break
    chain.unshift(parent)
    seen.add(parent.id)
    parentId = parent.parentTaskId ?? null
  }
  return chain
}
