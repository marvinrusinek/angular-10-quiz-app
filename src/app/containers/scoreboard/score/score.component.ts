import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, of, pipe, Subject, Subscription } from 'rxjs';
import { map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements OnInit, OnDestroy {
  score: string;
  currentScore$: Observable<string>;
  correctAnswersCount: number;
  correctAnswersCount$: Observable<number>;
  correctAnswersCountSubscription: Subscription;
  totalQuestions: number = 0;
  totalQuestionsSubscription: Subscription;
  unsubscribeTrigger$ = new Subject<void>();
  currentScoreSubscription: Subscription;

  constructor(private quizService: QuizService) {}

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    /* this.totalQuestionsSubscription = this.quizService.totalQuestionsSubject.subscribe(
      (totalQuestions) => {
        this.totalQuestions = totalQuestions;
      }
    ); */

    this.displayNumericalScore();
    this.currentScore$ = this.quizService.currentScore$;
    this.currentScoreSubscription = this.currentScore$.subscribe(
      (score: string) => {
        this.currentScore = score;
      }
    );
  }

  ngOnDestroy(): void {
    this.totalQuestionsSubscription.unsubscribe();
    this.correctAnswersCountSubscription.unsubscribe();
  }

  displayNumericalScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(
        takeUntil(this.unsubscribeTrigger$),
        map(correctAnswersCount => `${correctAnswersCount}/${this.quizService.getTotalQuestions()}`)
      )
      .subscribe((score: string) => {
        this.score = score;
        this.currentScore$ = of(this.score);
      });
  }  

  displayPercentageScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score =
          Math.round(
            (this.correctAnswersCount / this.totalQuestions) * 100
          ).toString() + '%';
        this.currentScore$ = of(this.score);
      });
  }
}
