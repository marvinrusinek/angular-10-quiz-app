import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizService: QuizService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    return this.quizService.isQuizSelected().pipe(
      map(isSelected => {
        if (!isSelected) {
          console.log('QuizGuard canActivate: quiz not selected');
          this.router.navigate(['/select']);
          return false;
        } else {
          console.log('QuizGuard canActivate: quiz selected');
          return true;
        }
      })
    );
  }  
}
