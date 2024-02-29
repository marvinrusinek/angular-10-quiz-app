import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-quiz-header',
  templateUrl: './quiz-header.component.html',
  styleUrls: ['./quiz-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizHeaderComponent { 
  currentQuiz: Quiz;
  currentQuiz$: Observable<Quiz>;

  constructor(private quizService: QuizService) {
    this.currentQuiz$ = this.quizDataService.quizzes$.pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === this.quizService.quizId))
    );
  }
}