import { QuizQuestion } from './QuizQuestion.model';

export interface QuestionsData {
  quizId: string;
  questions: QuizQuestion[];
}