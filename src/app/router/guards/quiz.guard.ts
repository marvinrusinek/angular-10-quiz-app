import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

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
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        console.log('NavigationStart:', event.url);
      }
      if (event instanceof NavigationEnd) {
        console.log('NavigationEnd:', event.url);
      }
      if (event instanceof NavigationError) {
        console.error('NavigationError:', event.error);
      }
    });

    const quizId = route.params['quizId'];
    const questionIndex = +route.params['questionIndex'];

    console.log('QuizGuard - quizId:', quizId);
    console.log('QuizGuard - questionIndex:', questionIndex);

    return this.quizDataService.selectedQuizSubject.pipe(
      switchMap(selectedQuiz => {
        if (!selectedQuiz) {
          console.error('Selected quiz is null.');
          this.router.navigate(['/select']);
          return of(false);
        }

        console.log('Selected quiz::::>>>', selectedQuiz);
  
        const totalQuestions = selectedQuiz.questions.length;
  
        // Check if it's the introduction route
        if (questionIndex === 0) {
          return of(true);
        }
  
        // Check if questionIndex is out of range
        if (questionIndex > totalQuestions) {
          this.router.navigate(['/question', quizId, totalQuestions - 1]);
          return of(false);
        } else if (questionIndex < 1) {
          this.router.navigate(['/question', quizId, 1]);
          return of(false);
        }
  
        // Allow navigation to the question route
        return of(true);
      }),
      catchError(error => {
        console.error(`Error fetching selected quiz: ${error}`);
        this.router.navigate(['/select']);
        return of(false);
      })
    );
  }  
}
