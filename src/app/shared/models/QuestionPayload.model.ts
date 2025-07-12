import { Option } from './Option.model';
import { QuizQuestion } from './QuizQuestion.model';

export interface QuestionPayload {
  question: QuizQuestion;
  options: Option[];
  explanation?: string;
}
