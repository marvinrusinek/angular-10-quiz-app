import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';

@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultsComponent implements OnInit, OnDestroy {
  quizData: Quiz[] = QUIZ_DATA;
  quizzes$: Observable<Quiz[]>;
  quizName$: Observable<string>;
  quizId: string;
  indexOfQuizId: number;
  elapsedMinutes: number;
  elapsedSeconds: number;
  checkedShuffle: boolean;
  unsubscribe$ = new Subject<void>();
// previousUserAnswers: any[] = [];

  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.activatedRoute.paramMap
      .pipe(takeUntil(this.unsubscribe$))
        .subscribe(params => this.quizId = params.get('quizId'));
    this.indexOfQuizId = this.quizData.findIndex(elem => elem.quizId === this.quizId);
    // this.sendPreviousUserAnswersToQuizService();
  }

  ngOnInit(): void {
    this.quizzes$ = this.quizService.getQuizzes();
    this.quizName$ = this.activatedRoute.url.pipe(map(segments => segments[1] + ''));
    this.checkedShuffle = this.quizService.checkedShuffle;
    // this.previousUserAnswers = this.quizService.userAnswers;
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  selectQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.quizId = '';
    this.indexOfQuizId = 0;
    this.router.navigate(['/select/']).then();
  }

  /* private sendPreviousUserAnswersToQuizService(): void {
    this.quizService.setPreviousUserAnswers(this.previousUserAnswers);
  } */
}
