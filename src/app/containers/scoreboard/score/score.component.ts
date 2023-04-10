import { AfterViewInit, ChangeDetectorRef, Component, Input, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil, tap } from 'rxjs/operators';

import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
})
export class ScoreComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() totalQuestions: number;
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
  percentageScoreSubscription: Subscription;

  totalQuestions: number = 0;
  totalQuestions$: Observable<number>;
  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  isPercentage: boolean = false;

  constructor(private quizService: QuizService,
    private changeDetectorRef: ChangeDetectorRef) {
    this.currentScoreSubject = new BehaviorSubject<string>('');
    this.currentScore$ = new BehaviorSubject<string>('');

    this.currentScoreSubscription = this.currentScore$
      .pipe(takeUntil(this.unsubscribeTrigger$))
      .subscribe((currentScore: string) => {
        this.currentScore = currentScore;
      });
  }

  ngOnInit(): void {
    this.isPercentage = true;
    this.correctAnswersCount = 0; 
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;

    this.currentScoreSubject = new BehaviorSubject<string>('0');
    this.currentScoreSubject.next(`${this.correctAnswersCount}/${this.totalQuestions}`);

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
  }

  setCorrectAnswersCount(count: number): void {
    this.correctAnswersCount = count;
    this.correctAnswersCount$.next(count);
  }

  setTotalQuestions(count: number): void {
    this.totalQuestions = count;
  }

  displayScore(): void {
    if (this.isPercentage) {
      const percentageScore = this.calculatePercentageScore();
      this.percentageScore = `${percentageScore.toFixed(0)}%`;
      this.currentScore$.next(this.percentageScore);
    } else {
      this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
      this.currentScore$.next(this.numericalScore);
    }
  }
  
  calculateNumericalScore(totalQuestions: number): string {
    const numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
    this.currentScore$.next(numericalScore);
    return numericalScore;
  }

  calculatePercentageScore(): number {
    if (this.totalQuestions !== 0) {
      return (this.correctAnswersCount / this.totalQuestions) * 100;
    }
  }

  displayNumericalScore(): void {
    this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
    this.currentScore$.next(this.numericalScore);
  }

  displayPercentageScore(): void {
      const percentage = (this.correctAnswersCount / this.totalQuestions) * 100;
      this.percentageScore = percentage.toFixed(0) + '%';
      this.percentageScore$.next(this.percentageScore);
  }
  
  toggleScoreDisplay(displayType: string): void {
    this.isPercentage = (displayType === 'percentage');
    if (this.isPercentage) {
      this.displayPercentageScore(this.totalQuestions);
    } else {
      this.displayNumericalScore();
    }
  }  
}
