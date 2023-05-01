import { Answer } from './Answer.type';

export interface Option {
  optionId?: number;
  text: string;
  correct?: boolean;
  value?: number;
  answer?: Answer;
  selected?: boolean;
  disabled?: boolean; 
  styleClass?: string;
}
type Options = Option[];