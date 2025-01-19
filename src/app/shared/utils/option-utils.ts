import { Option } from '../models/option.model';

export function isValidOption(option: Option): boolean {
  return option && typeof option === 'object' && 'text' in option && 'correct' in option;
}