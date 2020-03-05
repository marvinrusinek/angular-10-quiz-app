import { QuizQuestion } from './QuizQuestion';

export interface Quiz {
  abstract: string;
  image: string;
  questions: QuizQuestion[];
}
