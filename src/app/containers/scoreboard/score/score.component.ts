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
  numericalScore: string = '';
  percentageScore: string = '';

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

  displayPercentageScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.percentageScore = ((this.correctAnswersCount / totalQuestions) * 100).toFixed(0);
        this.currentScoreSubject.next(this.percentageScore.toString());
        this.currentScoreSubject.next(`${this.percentageScore}%`);
        this.isPercentage = true; // set isPercentage to true
      });
  }

  displayNumericalScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.score = `${this.correctAnswersCount}/${totalQuestions}`;
        this.numericalScore = this.correctAnswersCount + '/' + totalQuestions;
        this.currentScore$.next(this.numericalScore.toString());
        this.currentScoreSubject.next(this.score);
      });
  }

  calculatePercentageScore(totalQuestions: number): void {
    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.percentageScore = ((this.correctAnswersCount / totalQuestions) * 100).toFixed(0) + '%';
        if (this.isPercentage) {
          this.currentScore$.next(this.percentageScore);
        } else {
          this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
          this.currentScore$.next(this.numericalScore.toString());
        }
      });
  }  

  switchDisplay() {
    this.isPercentage = !this.isPercentage;
    if (this.isPercentage) {
      this.displayPercentageScore(this.totalQuestions);
    } else {
      if (this.percentageScore) {
        this.displayPercentageScore(this.totalQuestions);
      } else {
        this.displayNumericalScore(this.totalQuestions);
      }
    }
  }
}
