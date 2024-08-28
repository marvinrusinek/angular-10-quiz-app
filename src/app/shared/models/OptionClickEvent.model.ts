import { Option } from './Option.model';

export interface OptionClickEvent {
  option: Option;
  index: number;
}