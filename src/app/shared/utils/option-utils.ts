import { Option } from '../models/Option.model';

export function isValidOption(option: Option): boolean {
  if (!option || typeof option !== 'object') {
    console.warn('[isValidOption] Invalid option: Not an object or null.', { option });
    return false;
  }

  const requiredKeys = ['text', 'correct', 'optionId'];
  const missingKeys = requiredKeys.filter((key) => !(key in option));

  if (missingKeys.length > 0) {
    console.warn('[isValidOption] Option is missing required keys:', { option, missingKeys });
    return false;
  }

  if (typeof option.text !== 'string' || option.text.trim() === '') {
    console.warn('[isValidOption] Option text is invalid.', { option });
    return false;
  }

  if (typeof option.correct !== 'boolean') {
    console.warn('[isValidOption] Option "correct" field is not a boolean.', { option });
    return false;
  }

  if (typeof option.optionId !== 'number' || option.optionId <= 0) {
    console.warn('[isValidOption] Option "optionId" is invalid or missing.', { option });
    return false;
  }

  return true; // All checks passed
}
