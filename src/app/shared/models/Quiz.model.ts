import { QuizQuestion } from './QuizQuestion.model';

export interface Quiz {
  milestone: string;
  summary: string;
  imageUrl: string;
  questions: QuizQuestion[]
}
