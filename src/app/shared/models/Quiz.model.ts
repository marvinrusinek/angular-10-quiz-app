import { QuizQuestion } from './QuizQuestion.model';

export interface Quiz {
  quizId: string;
  milestone: string;
  summary: string;
  image: string;
  questions?: QuizQuestion[];
  status: 'Started' | 'Continue' | 'Completed';
}
