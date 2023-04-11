import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() totalQuestions: number;
  score: string;
  numericalScore: string;
  percentageScore: string;
  isPercentage: boolean = false;

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

  correctAnswersCountSubscription: Subscription;
  currentScoreSubscription: Subscription;
  numericalScoreSubscription: Subscription;
  percentageScoreSubscription: Subscription;
  percentageScore$: BehaviorSubject<string>;

  correctAnswersCount: number;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    this.currentScore$ = new BehaviorSubject<string>('');
    this.currentScoreSubject = new BehaviorSubject<string>('');
  }

  ngOnInit(): void {
    this.isPercentage = true;
    this.correctAnswersCount = 0;
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    this.currentScoreSubject = new BehaviorSubject<string>('0');
    this.currentScoreSubject.next(
      `${this.correctAnswersCount}/${this.totalQuestions}`
    );

    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((currentScore: string) => {
        this.currentScore = currentScore;
      });

    this.quizService.getTotalQuestions().subscribe((totalQuestions: number) => {
      this.totalQuestions = totalQuestions;
      this.displayNumericalScore();
    });

    this.percentageScore$ = new BehaviorSubject<string>('');
  }

  ngAfterViewInit(): void {
    // Subscribe to the percentageScore$ Observable
    this.percentageScoreSubscription = this.percentageScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((percentageScore: string) => {
        this.percentageScore = percentageScore;
        this.isPercentage = true;
        this.changeDetectorRef.detectChanges();
      });

    // Subscribe to the currentScore$ Observable
    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((score: string) => {
        this.currentScore = score;
        this.isPercentage = false;
        this.changeDetectorRef.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
    this.numericalScoreSubscription.unsubscribe();
    this.percentageScoreSubscription.unsubscribe();
  }

  displayNumericalScore(): void {
    this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
    this.currentScore$.next(this.numericalScore);
  }

  displayPercentageScore(): void {
    this.percentageScore = `${(
      (this.correctAnswersCount / this.totalQuestions) * 100
    ).toFixed(2)}%`;
    this.currentScore$.next(this.percentageScore);
  }

  toggleScoreDisplay(scoreType: 'numerical' | 'percentage'): void {
    this.isPercentage = scoreType === 'percentage';
    if (this.isPercentage) {
      this.displayPercentageScore();
    } else {
      this.displayNumericalScore();
    }
  }
}
