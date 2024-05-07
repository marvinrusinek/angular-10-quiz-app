import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';

@Component({
  selector: 'codelab-quiz-header',
  templateUrl: './quiz-header.component.html',
  styleUrls: ['./quiz-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizHeaderComponent { 
  currentQuiz$: Observable<Quiz>;

  constructor(private quizService: QuizService, private quizDataService: QuizDataService) {
    this.currentQuiz$ = this.quizDataService.quizzes$.pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === this.quizService.quizId))
    );
  }
}