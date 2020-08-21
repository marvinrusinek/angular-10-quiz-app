import { Observable } from 'rxjs';

export interface Score {
  quizId: string;
  score: Observable<number>;
  datetime: Date;
}
