import { QuizQuestion } from './QuizQuestion';

export interface Quiz {
  title: string;
  abstract: string;
  imageUrl: string;
  questions: QuizQuestion[];
}
