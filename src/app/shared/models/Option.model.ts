import { Answer } from './Answer.type';

export interface Option {
  optionId?: number;
  text: string;
  correct?: boolean;
  value?: number;
  answer?: Answer;
  selected?: boolean;
  active?: boolean;
  showIcon?: boolean;
  feedback?: string;
  styleClass?: string;
}
type Options = Option[];
type SelectedOption = Option;