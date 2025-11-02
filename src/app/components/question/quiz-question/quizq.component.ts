import { Component } from '@angular/core';
import { BaseQuestion } from '../basex/base-question';

@Component({
  selector: 'quizq',
  template: `<p>quizq works!</p>`
})
export class QuizQComponent extends BaseQuestion {
  loadDynamicComponent(...args: any[]): Promise<void> {
    return Promise.resolve();
  }
}
