import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';

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

    if (this.quizService.isQuizSelected()) {
      return true;
    }
    console.log('QuizGuard canActivate: quiz not selected');
    this.router.navigate(['/select']);
    return false;
  }  
}
