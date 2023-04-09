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
  numericalScore: string;
  percentageScore: string;

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>("");
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');
  currentScoreSubscription: Subscription;

  correctAnswersCount: number;
  correctAnswersCount$: Observable<number>;
  correctAnswersCountSubscription: Subscription;

  totalQuestions: number = 0;
  totalQuestions$: Observable<number>;
  unsubscribeTrigger$ = new Subject<void>();

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

    this.quizService.getTotalQuestions()
    .subscribe((totalQuestions: number) => {
      this.totalQuestions = totalQuestions;
      this.displayNumericalScore(this.totalQuestions);
    });
  }

  ngOnDestroy(): void {
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
  }

  displayNumericalScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
        this.currentScore$.next(this.numericalScore);
        this.currentScoreSubject.next(this.numericalScore);
      });
  }
  
  displayPercentageScore(): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.percentageScore = ((parseInt(this.numericalScore) / this.totalQuestions) * 100).toFixed(0) + '%';
        this.currentScore$.next(this.percentageScore);
      });
  }
}
