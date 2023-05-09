import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizService: QuizService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const quizId = route.params.quizId;
    return this.quizService.isQuizSelected().pipe(
      tap((isQuizSelected) => {
        if (!isQuizSelected) {
          console.log('QuizGuard canActivate: quiz not selected');
          this.router.navigate(['/select']);
        }
      }),
      switchMap(() => this.quizDataService.getQuizById(quizId)),
      map((quiz) => {
        if (quiz) {
          console.log('QuizGuard canActivate: quiz selected');
          return true;
        } else {
          console.log(`QuizGuard canActivate: quiz not found with id ${quizId}`);
          this.router.navigate(['/select']);
          return false;
        }
      })
    );
  }  
}
