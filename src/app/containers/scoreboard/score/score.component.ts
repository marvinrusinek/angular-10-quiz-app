import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, pipe, Subject, Subscription } from 'rxjs';
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
  currentScore: string;
  currentScore$: Observable<string>;
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  correctAnswersCount: number;
  correctAnswersCount$: Observable<number>;
  correctAnswersCountSubscription: Subscription;
  totalQuestions: number = 0;
  totalQuestions$: Observable<number>;
  totalQuestionsSubscription: Subscription;
  unsubscribeTrigger$ = new Subject<void>();
  currentScoreSubscription: Subscription;
  scoreSubscription: Subscription;

  constructor(private quizService: QuizService) {
    // this.totalQuestions = this.quizService.getTotalQuestions();
    // this.displayNumericalScore(this.totalQuestions);
  }

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
    this.displayNumericalScore();

    /* this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.score = `${correctAnswersCount}/${this.totalQuestions}`;
        this.currentScoreSubject.next(this.score);
      });

      of(this.quizService.getTotalQuestions())
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });  */   
  }

  ngOnDestroy(): void {
    this.totalQuestionsSubscription.unsubscribe();
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
    this.scoreSubscription.unsubscribe();
  }

  /* displayNumericalScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score = `${this.correctAnswersCount}/${this.totalQuestions}`;
        this.currentScoreSubject.next(this.score);
      });
  } */

  displayNumericalScore(): void {
    this.totalQuestionsSubscription = this.quizService.getTotalQuestions()
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
        this.correctAnswersCountSubscription = this.correctAnswersCount$
          .pipe(takeUntil(this.unsubscribeTrigger$))
          .subscribe((correctAnswersCount: number) => {
            this.correctAnswersCount = correctAnswersCount;
            this.score = `${this.correctAnswersCount}/${this.totalQuestions}`;
            this.currentScore$ = of(this.score);
          });
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
