const FORM_TRANSITIONS: Record<string, string[]> = {
  DRAFT:           ['PAYMENT_PENDING', 'ARCHIVED'],
  PAYMENT_PENDING: ['ACTIVE', 'ARCHIVED'],
  ACTIVE:          ['CLOSED'],
  CLOSED:          ['ACTIVE', 'ARCHIVED'],
  ARCHIVED:        [],
};

export function canTransitionForm(from: string, to: string): boolean {
  return FORM_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertFormTransition(from: string, to: string): void {
  if (!canTransitionForm(from, to)) {
    throw new Error(`Invalid form transition: ${from} → ${to}`);
  }
}
