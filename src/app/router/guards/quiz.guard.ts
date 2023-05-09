import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({
  providedIn: 'root'
})
export class QuizGuard implements CanActivate {
  constructor(
    private quizService: QuizService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const quizId = route.params.quizId;

    if (this.quizService.isQuizSelected()) {
      return true;
    } else {
      this.router.navigate(['/select']);
      return false;
    }
  }
}
