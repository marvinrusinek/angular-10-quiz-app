import { Observable } from 'rxjs';

export interface Quiz {
  totalQuestions: number;
  percentage: number;
  correctAnswersCount$: Observable<number>;
  completionTime: number;
}
  