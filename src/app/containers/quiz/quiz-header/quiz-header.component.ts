import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizDataService } from '../../../shared/services/quizdata.service';

@Component({
  selector: 'codelab-quiz-header',
  templateUrl: './quiz-header.component.html',
  styleUrls: ['./quiz-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizHeaderComponent { 
  currentQuiz: Quiz;

  constructor(private quizDataService: QuizDataService) {
    this.quizDataService.quizzes$.subscribe((quizzes) => {
      const currentQuiz = quizzes.find(
        (quiz) => quiz.quizId === this.quizDataService.currentQuizId
      );
      this.currentQuiz = currentQuiz;
    });
  }
}