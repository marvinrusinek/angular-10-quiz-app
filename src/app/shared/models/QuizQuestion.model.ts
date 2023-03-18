import { Option } from './Option.model';

export interface QuizQuestion {
  questionText: string;
  options: Option[];
  explanation: string;
  question: string;
  selectedOptions: string[];
  answer: Option[];
  milestone: string;
  selectedOptionIds?: number[];
}
