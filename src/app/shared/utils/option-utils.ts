import { Option } from '../models/Option.model';

/* export function isValidOption(option: Option): boolean {
  return option && typeof option === 'object' && 'text' in option && 'correct' in option;
} */
export function isValidOption(option: Option): boolean {
  const errors: string[] = [];

  if (!option || typeof option !== 'object') {
    errors.push('Option is not an object or is null.');
  } else {
    if (!('text' in option) || typeof option.text !== 'string' || option.text.trim() === '') {
      errors.push('Option is missing a valid "text" field.');
    }
    if ('correct' in option && typeof option.correct !== 'boolean') {
      errors.push('Option has an invalid "correct" field (must be boolean).');
    }
    if (!('optionId' in option) || typeof option.optionId !== 'number' || option.optionId <= 0) {
      errors.push('Option is missing a valid "optionId" field.');
    }
  }

  if (errors.length > 0) {
    console.warn('[isValidOption] Option validation failed.', { option, errors });
    return false;
  }

  return true;
}
