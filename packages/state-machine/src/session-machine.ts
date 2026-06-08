const SESSION_TRANSITIONS: Record<string, string[]> = {
  ACTIVE:      ['REVIEW', 'INTERRUPTED'],
  REVIEW:      ['ACTIVE', 'SUBMITTED'],
  SUBMITTED:   [],
  INTERRUPTED: [],
};

export function canTransitionSession(from: string, to: string): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertSessionTransition(from: string, to: string): void {
  if (!canTransitionSession(from, to)) {
    throw new Error(`Invalid session transition: ${from} → ${to}`);
  }
}
