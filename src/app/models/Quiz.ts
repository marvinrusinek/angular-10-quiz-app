import { QuizQuestion } from './QuizQuestion';

export interface Quiz {
  milestoneTitle: string;
  milestoneAbstract: string;
  imageUrl: string;
  questions: QuizQuestion[];
}
