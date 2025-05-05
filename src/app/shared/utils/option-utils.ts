import { Option } from '../models/Option.model';

export function isValidOption(option: Option): boolean {
  return option && 
         typeof option === 'object' && 
         'text' in option && 
         'correct' in option;
}