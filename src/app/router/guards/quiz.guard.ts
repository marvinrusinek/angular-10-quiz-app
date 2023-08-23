import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizDataService: QuizDataService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const quizId = route.params['quizId'];
    const questionIndex = +route.params['questionIndex'];
  
    return this.quizDataService.getSelectedQuiz().pipe(
      map(selectedQuiz => {
        if (!selectedQuiz) {
          console.error('Selected quiz is null.');
          this.router.navigate(['/select']);
          return false;
        }
  
        const totalQuestions = selectedQuiz.questions.length;
  
        if (questionIndex < 0 || questionIndex > totalQuestions) {
          this.router.navigate(['/select']);
          return false;
        }
  
        return true;
      }),
      catchError(error => {
        console.error(`Error fetching selected quiz: ${error}`);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }  
}
