import { Option } from './Option.model';

export interface QuizQuestion {
  questionText: string;
  options: Option[];
  explanation: string;
  selectedOptions?: string[];
  answer?: Option[];
  selectedOptionIds?: number[];
}
