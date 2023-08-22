import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizService: QuizService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    const quizId = route.params['quizId'];
    const questionIndex = route.params['questionIndex'];
    console.log('QuizGuard - quizId:', quizId);
    console.log('QuizGuard - questionIndex:', questionIndex);
  
    return this.quizService.getSelectedQuiz().pipe(
      map((selectedQuiz: Quiz) => {
        const totalQuestions = selectedQuiz.questions.length;
  
        if (questionIndex >= totalQuestions) {
          this.router.navigate(['/quiz', quizId, 'question', totalQuestions - 1]);
          return false;
        } else if (questionIndex < 1) {
          this.router.navigate(['/quiz', quizId, 'question', 1]);
          return false;
        }
  
        return true;
      }),
      catchError(() => {
        console.log('QuizGuard canActivate: quiz not selected');
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  } 
}
