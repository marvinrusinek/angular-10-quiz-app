import { QuizQuestion } from './QuizQuestion';

export interface Quiz {
  title: string;
  abstract: string;
  image: string;
  questions: QuizQuestion[];
}
