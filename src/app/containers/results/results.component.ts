import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';

@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsComponent implements OnInit, OnDestroy {
  quizData: Quiz[] = QUIZ_DATA;
  quizId: string;
  indexOfQuizId: number;
  unsubscribe$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.quizService.setPreviousUserAnswersText(
      this.quizService.questions,
      this.quizService.userAnswers
    );
  }

  ngOnInit(): void {
    this.fetchQuizIdFromParams();
    this.setCompletedQuiz();
    this.findQuizIndex();
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  private fetchQuizIdFromParams(): void {
    this.activatedRoute.paramMap.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(params => {
      this.quizId = params.get('quizId');
      this.setCompletedQuiz();
      this.findQuizIndex();
    });
  }

  private setCompletedQuiz(): void {
    if (this.quizId) {
      this.quizService.setCompletedQuizId(this.quizId);
    }
  }

  private findQuizIndex(): void {
    if (this.quizId) {
      this.indexOfQuizId = this.quizData.findIndex(
        elem => elem.quizId === this.quizId
      );
    }
  }

  selectQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.quizId = '';
    this.indexOfQuizId = 0;
    this.router.navigate(['/select/']);
  }
}
