import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { QuizQuestionComponent } from './path-to-your-quiz-question.component';

@Injectable({
  providedIn: 'root',
})
export class CanDeactivateGuard
  implements CanDeactivate<QuizQuestionComponent>
{
  canDeactivate(component: QuizQuestionComponent): boolean {
    return component.canDeactivate();
  }
}
