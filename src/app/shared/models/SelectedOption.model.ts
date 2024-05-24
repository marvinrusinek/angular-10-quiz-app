import { Option } from './option.model';

export interface SelectedOption extends Option {
  questionIndex: number;
}