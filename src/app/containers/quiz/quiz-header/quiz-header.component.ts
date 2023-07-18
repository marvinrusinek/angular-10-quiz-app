import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Quiz } from '../../../shared/models/Quiz.model';

@Component({
  selector: 'codelab-quiz-header',
  templateUrl: './quiz-header.component.html',
  styleUrls: ['./quiz-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizHeaderComponent { 
  currentQuiz: Quiz;

  constructor() {
    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  }
}