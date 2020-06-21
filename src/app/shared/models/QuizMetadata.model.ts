import { Observable } from 'rxjs';

export interface QuizMetadata {
  totalQuestions: number;
  percentage: number;
  correctAnswersCount$: Observable<number>;
  completionTime: number;
}
  