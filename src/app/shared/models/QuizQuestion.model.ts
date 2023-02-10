import { Option } from './Option.model';

export interface QuizQuestion {
  questionText: string;
  options: Option[];
  explanation: string;

  question: string;
  answer: string[];
  selectedOptions: string[];
}
// type Questions = QuizQuestion[];
