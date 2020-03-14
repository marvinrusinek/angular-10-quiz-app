import { Option } from './Option';

export interface QuizQuestion {
  id: number;
  questionText: string;
  options: Option[];
  explanation: string;
}
type Questions = QuizQuestion[];
