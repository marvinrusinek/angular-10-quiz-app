import { Answer } from './Answer.type';

export interface Option {
  text: string;
  correct?: boolean;
  selected?: boolean;
  styleClass?: string;
  value: number;
  optionId?: number;
  answer: Answer;
}
type Options = Option[];
