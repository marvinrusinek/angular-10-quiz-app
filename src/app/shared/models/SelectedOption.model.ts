import { Option } from './Option.model';

export interface SelectedOption extends Option {
  questionIndex?: number;
}