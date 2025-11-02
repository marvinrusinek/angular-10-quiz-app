import { Component } from '@angular/core';
import { BaseQuestion } from '../base/base-question';

@Component({
  selector: 'quizq',
  templateUrl: './quizq.component.html'
})
export class QuizQComponent extends BaseQuestion {
  loadDynamicComponent(...args: any[]): Promise<void> {
    return Promise.resolve();
  }
}
