import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, EMPTY } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Quiz }      from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';

export interface QAData {
  question: Question;
  options:  Option[];
}

@Injectable({ providedIn: 'root' })
export class QAResolverService implements Resolve<QAData> {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  resolve(route: ActivatedRouteSnapshot): Observable<QAData> {
    const quizId     = route.params['quizId'];
    const questionIdx = Number(route.params['questionIndex']);

    return this.quizDataService.getQuiz(quizId).pipe(
      map((quiz: Quiz) => {
        const question = quiz.questions?.[questionIdx];
        if (!question) {
          console.error(`❌ Question #${questionIdx} not found in quiz ${quizId}`);
          this.router.navigate(['/select']);
          throw new Error('Question not found');
        }
        return {
          question,
          options: question.options ?? []
        };
      }),
      catchError(err => {
        console.error('[QAResolverService error]', err);
        this.router.navigate(['/select']);
        return EMPTY;
      })
    );
  }
}
