import { QuizQuestion } from './QuizQuestion.model';

export interface LockedState {
  index: number;
  text: string;
  snapshot: QuizQuestion | null;
  timestamp: number;
}