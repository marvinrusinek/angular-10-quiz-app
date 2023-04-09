import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements OnInit, OnDestroy {
  score: string;
  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>('0/0');
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
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
    this.currentScoreSubject = new BehaviorSubject<string>('');
    this.currentScore$ = new BehaviorSubject<string>('');
  }

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    this.quizService.getTotalQuestions().subscribe((totalQuestions: number) => {
      this.totalQuestions = totalQuestions;
      this.displayNumericalScore(this.totalQuestions);
    });
  }

  ngOnDestroy(): void {
    this.totalQuestionsSubscription.unsubscribe();
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
    this.scoreSubscription.unsubscribe();
  }

  displayNumericalScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score = `${this.correctAnswersCount}/${totalQuestions}`;
        this.currentScore$.next(this.score);
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
