import { QuizQuestion } from './QuizQuestion.model';

export interface Quiz {
  quizId: string;
  milestone: string;
  summary: string;
  imageUrl: string;
  questions: QuizQuestion[];
  status: 'started' | 'continue' | 'completed' | '';
}

