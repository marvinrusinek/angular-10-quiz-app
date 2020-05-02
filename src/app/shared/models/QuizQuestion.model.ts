import { Option } from './Option.model';

export interface QuizQuestion {
  type: string,
  questionText: string,
  options: Option[],
  explanation: string,
  shuffledAnswers?: string
}
// type Questions = QuizQuestion[];
