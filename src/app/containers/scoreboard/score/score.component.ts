import { Component, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil, tap } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements OnInit, OnDestroy {
  score: string;
  numericalScore: string = '';
  percentageScore: string = '';

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  currentScoreSubscription: Subscription;
  numericalScoreSubscription: Subscription;
  percentageScore$: BehaviorSubject<string>;

  correctAnswersCount: number;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  correctAnswersCountSubscription: Subscription;

  totalQuestions: number = 0;
  totalQuestions$: Observable<number>;
  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  isPercentage: boolean = false;

  constructor(private quizService: QuizService) {
    this.currentScoreSubject = new BehaviorSubject<string>('');
    this.currentScore$ = new BehaviorSubject<string>('');

    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((currentScore: string) => {
        this.currentScore = currentScore;
      });
  }

  ngOnInit(): void {
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    this.currentScoreSubject = new BehaviorSubject<string>('0');

    this.quizService.getTotalQuestions().subscribe((totalQuestions: number) => {
      this.totalQuestions = totalQuestions;
      this.displayNumericalScore();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
  }

  setCorrectAnswersCount(count: number): void {
    this.correctAnswersCount = count;
    this.correctAnswersCount$.next(count);
  }

  setTotalQuestions(count: number): void {
    this.totalQuestions = count;
  }

  calculateNumericalScore(totalQuestions: number): string {
    const numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
    this.currentScore$.next(numericalScore);
    return numericalScore;
  }

  calculatePercentageScore(totalQuestions: number): void {
    if (totalQuestions !== 0) {
      const percentage = (this.correctAnswersCount / totalQuestions) * 100;
      this.percentageScore = Math.round(percentage) + '%';
      this.currentScoreSubject.next(this.percentageScore);
    }
  }

  displayNumericalScore(): void {
    this.numericalScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((score) => {
        this.numericalScore = score;
      });
  }

  displayPercentageScore(totalQuestions: number): void {
    this.percentageScore$ = new BehaviorSubject<string>(this.percentageScore);
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.percentageScore = `${Math.round((this.correctAnswersCount / totalQuestions) * 100)}%`;
        this.percentageScore$.next(this.percentageScore);
        this.currentScoreSubject.next(this.isPercentage ? this.percentageScore : `${this.correctAnswersCount}/${totalQuestions}`);
      });
  }

  toggleScoreDisplay(): void {
    this.isPercentage = !this.isPercentage;
    if (this.isPercentage) {
      this.displayPercentageScore(this.totalQuestions);
    } else {
      this.displayNumericalScore();
    }
  }
}
