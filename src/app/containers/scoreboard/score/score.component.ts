import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  OnDestroy,
  SimpleChanges
} from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements AfterViewInit, OnInit, OnChanges, OnDestroy {
  @Input() correctAnswersCount: number = 0;
  @Input() totalQuestions: number = 0;
  totalQuestions$: Observable<number>;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(
    0
  );
  score: string;
  numericalScore: string;
  percentageScore: string;
  isPercentage: boolean = false;
  percentage: number = 0;

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );

  correctAnswersCountSubscription: Subscription;
  currentScoreSubscription: Subscription;
  numericalScoreSubscription: Subscription;
  percentageScoreSubscription: Subscription;
  percentageScore$: BehaviorSubject<string>;
  numericalScore$: BehaviorSubject<string>;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.isPercentage = true;
    this.currentScore$ = new BehaviorSubject<string>('');
    this.totalQuestions$ = this.quizService.getTotalQuestions();
    this.percentageScore$ = new BehaviorSubject<string>('');
    this.numericalScore$ = new BehaviorSubject<string>('');

    this.correctAnswersCount = 0;
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    this.currentScoreSubject = new BehaviorSubject<string>('0');
    this.currentScoreSubject.next(
      `${this.correctAnswersCount}/${this.totalQuestions}`
    );

    this.correctAnswersCountSubscription = this.correctAnswersCount$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((correctAnswersCount: number) => {
        this.correctAnswersCount = correctAnswersCount;
        this.displayNumericalScore();
      });

    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((currentScore: string) => {
        this.currentScore = currentScore;
      });

    this.quizService.getTotalQuestions().subscribe((totalQuestions: number) => {
      this.totalQuestions = totalQuestions;
      this.displayNumericalScore();
    });

    this.quizService.totalQuestions$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Check if correctAnswersCount and totalQuestions inputs have changed
    if (
      changes.correctAnswersCount &&
      changes.totalQuestions &&
      changes.correctAnswersCount.currentValue !== undefined &&
      changes.totalQuestions.currentValue !== undefined
    ) {
      // Calculate percentage
      this.percentage = (this.correctAnswersCount / this.totalQuestions) * 100;
    }
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

    this.numericalScoreSubscription = this.numericalScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((numericalScore: string) => {
        this.numericalScore = numericalScore;
        this.currentScore$.next(this.numericalScore);
        this.isPercentage = false;
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
    this.correctAnswersCountSubscription.unsubscribe();
    this.currentScoreSubscription.unsubscribe();
    this.numericalScoreSubscription.unsubscribe();
    this.percentageScoreSubscription.unsubscribe();
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.currentScore$.complete();
    this.percentageScore$.complete();
    this.numericalScore$.complete();
  }

  displayNumericalScore(): void {
    this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
    this.currentScore$.next(this.numericalScore);
  }

  displayPercentageScore(): void {
    this.percentageScore = `${(
      (this.correctAnswersCount / this.totalQuestions) *
      100
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
