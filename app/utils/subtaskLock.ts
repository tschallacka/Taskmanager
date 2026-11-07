// Whether a subtask list is locked, and whether it should say why. A customer contact is locked by the drawer, which
// hides the list's controls for them. A board that is read through the crew that keeps it is read-only for its staff:
// the server refuses every change there, so the list locks too, and it says why in one line where the add row would be.
export interface SubtaskLock {
  locked: boolean
  boardNote: boolean
}

export function subtaskLockState(input: { customerReadonly: boolean, boardReadOnly: boolean }): SubtaskLock {
  return {
    locked: input.customerReadonly || input.boardReadOnly,
    // A customer contact has their own rule and gets no note about the board.
    boardNote: input.boardReadOnly && !input.customerReadonly
  }
}
