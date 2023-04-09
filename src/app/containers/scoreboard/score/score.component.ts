import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, of, Subject, Subscription } from 'rxjs';
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
    this.totalQuestions = this.quizService.getTotalQuestions();
    this.displayNumericalScore(this.totalQuestions);
  }

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
  }

  ngOnDestroy(): void {
    this.totalQuestionsSubscription.unsubscribe();
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
    this.scoreSubscription.unsubscribe();
  }

  displayNumericalScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(
        takeUntil(this.unsubscribeTrigger$),
        map(correctAnswersCount => `${correctAnswersCount}/${totalQuestions}`)
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
