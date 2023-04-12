import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  OnDestroy
} from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, pipe, Subject, Subscription, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent
  implements AfterViewInit, OnInit, OnDestroy
{
  @Input() correctAnswersCount: number = 0;
  @Input() totalQuestions: number = 0;
  questions$: Observable<QuizQuestion[]>;
  totalQuestions$: Observable<number>;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  score: string;
  numericalScore: string = '0/0';
  percentageScore: string;
  isPercentage: boolean = false;
  percentage: number = 0;

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(this.numericalScore);
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

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
  ) {
    this.totalQuestions$ = this.quizService.getTotalQuestions();
  }

  ngOnInit(): void {
    this.isPercentage = true;
    this.currentScore$ = new BehaviorSubject<string>('');
    this.numericalScore$ = new BehaviorSubject<string>('');
    this.percentageScore$ = new BehaviorSubject<string>('');

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
      });

    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((currentScore: string) => {
        this.currentScore = currentScore;
      });

    this.questions$ = this.quizService.getQuestions();

    /* this.questions$.subscribe((questions) => {
      this.quizService.getTotalQuestions().subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
        this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
        timer(0).subscribe(() => {
          this.displayNumericalScore();
        });
      });
    }); */

    combineLatest([this.questions$, this.quizService.getTotalQuestions()]).subscribe(([questions, totalQuestions]) => {
      this.totalQuestions = totalQuestions;
      this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
      timer(0).subscribe(() => {
        this.displayNumericalScore();
      });
    });
  }

  ngAfterViewInit(): void {
    // Subscribe to the currentScore$ Observable
    this.currentScoreSubscription = this.currentScore$
    .pipe(takeUntil(this.unsubscribeTrigger$))
    .subscribe((score: string) => {
      this.currentScore = score;
      this.isPercentage = false;
      this.changeDetectorRef.detectChanges();
    });

    // Subscribe to the numericalScore$ Observable
    this.numericalScoreSubscription = this.numericalScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((numericalScore: string) => {
        this.numericalScore = numericalScore;
        this.currentScore$.next(this.numericalScore);
        this.isPercentage = false;
        this.changeDetectorRef.detectChanges();
      });

    // Subscribe to the percentageScore$ Observable
    this.percentageScoreSubscription = this.percentageScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((percentageScore: string) => {
        this.percentageScore = percentageScore;
        this.isPercentage = true;
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
    this.numericalScore$.complete();
    this.percentageScore$.complete();
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
