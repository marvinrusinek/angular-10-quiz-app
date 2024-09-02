import { Answer } from './Answer.type';

export interface Option {
  optionId?: number;
  text: string;
  correct?: boolean;
  value?: number;
  answer?: Answer;
  selected?: boolean;
  showIcon?: boolean;
  disabled?: boolean; 
  feedback?: string;
  styleClass?: string;
}
type Options = Option[];