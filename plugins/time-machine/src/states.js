/** @typedef {import('../types').State} State */

/** The ids from `cursor` back to the start: the states the files are made of now. @param {State[]} states @param {number | null} cursor */
export function lineOf (states, cursor) {
  /** @type {Set<number>} */
  const line = new Set()
  if (cursor === null) return line
  /** @type {Map<number, number | null>} */
  const parentOf = new Map()
  for (const state of states) parentOf.set(state.id, state.parent)
  let id = cursor
  while (id !== null && !line.has(id)) {
    line.add(id)
    id = parentOf.get(id) ?? null
  }
  return line
}

/**
 * The next id: one past the highest. It comes from the states themselves, never from a
 * counter of the module, which a hot reload starts over while the states stay.
 * @param {State[]} states
 */
export const nextId = states => states.reduce((max, state) => Math.max(max, state.id), 0) + 1

/**
 * The saved states and the live ones (what a hot reload keeps), merged by commit, in the order
 * they were made. A reload that raced the end of a turn could hand out an id twice: the later
 * state with a taken id gets a new one. A state whose parent is that id came after the first,
 * so it stays the first's child. `repaired` lists the states whose ref has to be pointed again.
 * @param {State[]} saved
 * @param {State[]} live
 */
export function merge (saved, live) {
  /** @type {Map<string, State>} */
  const byCommit = new Map()
  for (const state of [...saved, ...live]) byCommit.set(state.commit, state)
  const merged = [...byCommit.values()].sort((a, b) => a.at - b.at || a.id - b.id)

  let max = nextId(merged) - 1
  /** @type {Map<number, State>} */
  const firstById = new Map()
  /** @type {State[]} */
  const repaired = []
  const states = merged.map(state => {
    const first = firstById.get(state.id)
    if (!first) {
      firstById.set(state.id, state)
      return state
    }
    const moved = { ...state, id: ++max }
    repaired.push(moved, first)
    return moved
  })
  return { states, repaired }
}
