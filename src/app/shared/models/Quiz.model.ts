import { QuizQuestion } from './QuizQuestion.model';

export interface Quiz {
  id: string,
  milestone: string,
  summary: string,
  imageUrl: string,
  questions: QuizQuestion[]
}
