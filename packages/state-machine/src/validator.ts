import { ValidationResult } from '@fluxforms/shared-types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAnswer(
  type: string,
  value: string,
  options?: string[],
): ValidationResult {
  const trimmed = value.trim();

  switch (type) {
    case 'TEXT':
      return trimmed.length > 0
        ? { valid: true }
        : { valid: false, error: 'Answer cannot be empty.' };

    case 'NUMBER':
      return trimmed.length > 0 && !isNaN(Number(trimmed))
        ? { valid: true }
        : { valid: false, error: 'Please enter a valid number.' };

    case 'EMAIL':
      return EMAIL_REGEX.test(trimmed)
        ? { valid: true }
        : { valid: false, error: 'Please enter a valid email address.' };

    case 'YES_NO':
      return ['yes', 'no'].includes(trimmed.toLowerCase())
        ? { valid: true }
        : { valid: false, error: 'Please select Yes or No.' };

    case 'MULTIPLE_CHOICE':
      return options?.includes(trimmed)
        ? { valid: true }
        : { valid: false, error: 'Please select one of the provided options.' };

    default:
      return { valid: false, error: 'Unknown question type.' };
  }
}
