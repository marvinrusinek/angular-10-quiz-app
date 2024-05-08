import { ChangeDetectionStrategy, Component, Input, OnInit, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreComponent implements OnInit, OnDestroy {
  @Input() correctAnswersCount = 0;
  @Input() totalQuestions = 0;
  questions$: Observable<QuizQuestion[]>;
  totalQuestions$: Observable<number>;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(0);

  numericalScore = '0/0';
  percentageScore = '';
  isPercentage = false;
  percentage = 0;

  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(this.numericalScore);
  scoreSubscription: Subscription;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(private quizService: QuizService) {
    this.totalQuestions$ = this.quizService.getTotalQuestions();
  }

  ngOnInit(): void {
    this.setupScoreSubscription();
  }

  ngOnDestroy(): void {
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.currentScore$.complete();
    this.scoreSubscription?.unsubscribe();
  }

  private setupScoreSubscription(): void {
    this.scoreSubscription = combineLatest([
      this.correctAnswersCount$.pipe(
        takeUntil(this.unsubscribeTrigger$),
        distinctUntilChanged()
      ),
      this.totalQuestions$,
      this.quizService.getAllQuestions()
    ]).pipe(
      map(this.processScoreData),
      catchError(this.handleError)
    ).subscribe({
      next: this.handleScoreUpdate,
      error: error => console.error('Error in ScoreComponent subscription:', error)
    });
  }

  private processScoreData = ([correctAnswersCount, totalQuestions, questions]) => {
    this.totalQuestions = totalQuestions;
    return { correctAnswersCount, totalQuestions, questions };
  }

  private handleScoreUpdate = ({ correctAnswersCount, totalQuestions, questions }) => {
    this.correctAnswersCount = correctAnswersCount;
    this.updateScoreDisplay();
  }

  private handleError = (error: Error) => {
    console.error('Error in combineLatest in ScoreComponent:', error);
    return of({ correctAnswersCount: 0, totalQuestions: 0, questions: [] });
  }

  toggleScoreDisplay(scoreType?: 'numerical' | 'percentage'): void {
    // Store the current state of isPercentage before changing it
    const previousIsPercentage = this.isPercentage;
    
    // Update isPercentage based on the user's choice
    if (scoreType) {
      this.isPercentage = (scoreType === 'percentage');
    }

    // Call updateScoreDisplay only if the display type has actually changed
    if (this.isPercentage !== previousIsPercentage) {
      this.updateScoreDisplay();
    }
  }

  updateScoreDisplay(): void {
    if (this.isPercentage) {
      this.displayPercentageScore();
    } else {
      this.displayNumericalScore();
    }
  }

  displayPercentageScore(): void {
    const totalPossibleScore = 100;
    this.percentageScore = `${(
      (this.correctAnswersCount / this.totalQuestions) *
      totalPossibleScore
    ).toFixed(2)}%`;
    this.currentScore$.next(this.percentageScore);
  }

  displayNumericalScore(): void {
    this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
    this.currentScore$.next(this.numericalScore);
  }
}
