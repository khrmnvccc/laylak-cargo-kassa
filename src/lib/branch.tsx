import { createContext, useContext } from 'react';

// Filiallar: the branch picked at the top of the page goes with every request (x-branch), so the
// server reads and writes that branch. 0 means every branch this person may see.
const KEY = 'lk_branch';

function read(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

let current = read();

export const currentBranch = () => current;

export function saveBranch(id: number) {
  current = id > 0 ? id : 0;
  try {
    if (current) localStorage.setItem(KEY, String(current));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the pick lasts until the page is reloaded.
  }
}

export interface Branch { id: number; name: string }

export interface BranchState {
  /** Every branch there is. */
  all: Branch[];
  /** The ones this person may see. */
  mine: Branch[];
  /** The branch picked at the top; 0 = all of mine. */
  current: number;
  pick: (id: number) => void;
}

export const BranchContext = createContext<BranchState>({ all: [], mine: [], current: 0, pick: () => undefined });
export const useBranches = () => useContext(BranchContext);

/** Name of the branch picked, or null when several are shown together. */
export function branchLabel(state: BranchState): string | null {
  if (state.mine.length === 1) return state.mine[0].name;
  return state.mine.find((b) => b.id === state.current)?.name ?? null;
}

/** True when a new record needs a branch picked first (several visible, "all" picked). */
export const needsPick = (state: BranchState) => state.mine.length > 1 && !state.mine.some((b) => b.id === state.current);
