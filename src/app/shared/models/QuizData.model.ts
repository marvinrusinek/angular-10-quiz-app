import { QuizQuestion } from './QuizQuestion.model';

export interface QuizData {
  quizId: string;
  questions: QuizQuestion[];
}
