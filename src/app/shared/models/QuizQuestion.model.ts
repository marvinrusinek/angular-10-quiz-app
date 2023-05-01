import { Option } from './Option.model';

export interface QuizQuestion {
  questionText: string;
  options: Option[];
  explanation: string;
  selectedOptions?: Option[];
  answer?: Option[];
  selectedOptionIds?: number[];
  maxSelections?: number;
}
