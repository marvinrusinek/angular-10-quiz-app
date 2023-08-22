import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

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

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const quizId = route.params['quizId'];
    const questionIndex = +route.params['questionIndex']; // Convert to a number
  
    return this.quizService.getSelectedQuiz().pipe(
      tap(selectedQuiz => console.log('Selected quiz in guard:', selectedQuiz)),
      map(selectedQuiz => {
        if (!selectedQuiz) {
          console.error('Selected quiz is null.');
          this.router.navigate(['/select']);
          return false;
        }
  
        const totalQuestions = selectedQuiz.questions.length;
  
        // Check if it's the introduction route
        if (questionIndex === 0) {
          return true;
        }
  
        // Check if questionIndex is out of range
        if (questionIndex >= totalQuestions) {
          this.router.navigate(['/question', quizId, totalQuestions - 1]);
          return false;
        } else if (questionIndex < 1) {
          this.router.navigate(['/question', quizId, 1]);
          return false;
        }
  
        // Allow navigation to the question route
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
