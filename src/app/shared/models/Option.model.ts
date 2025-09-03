import { Answer } from './Answer.type';

export interface Option {
  optionId?: number;
  text: string;
  correct?: boolean;
  value?: number;
  answer?: Answer;
  selected?: boolean;
  active?: boolean;
  highlight?: boolean;
  showIcon?: boolean;
  feedback?: string;
  showFeedback?: boolean;
  styleClass?: string;
}
type Options = Option[];
type SelectedOption = Option;