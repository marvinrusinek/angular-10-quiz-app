import { QuizQuestion } from './QuizQuestion.model';

export interface Quiz {
  quizId: string;
  milestone: string;
  summary: string;
  imageUr: string;
  questions: QuizQuestion[];
  status: 'started' | 'continue' | 'completed' | '';
}

