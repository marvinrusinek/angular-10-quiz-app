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
    if (this.quizService.isQuizSelected()) {
      return true;
    }
    console.log('QuizGuard canActivate: quiz not selected');
    this.router.navigate(['/select']);
    return false;
  }  
}
