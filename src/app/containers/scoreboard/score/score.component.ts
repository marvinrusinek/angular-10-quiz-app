import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnDestroy
} from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  Subject,
  Subscription
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  map,
  switchMap,
  takeUntil
} from 'rxjs/operators';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.numericalScore
  );
  scoreSubscription: Subscription;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(private quizService: QuizService) {
    this.totalQuestions$ = this.quizService.getTotalQuestions();
  }

  ngOnInit(): void {
    this.isPercentage = true;

    this.totalQuestions$.subscribe((total) => {
      this.totalQuestions = total;
      this.displayNumericalScore();
    });

    this.scoreSubscription = combineLatest([
      this.correctAnswersCount$.pipe(
        takeUntil(this.unsubscribeTrigger$),
        distinctUntilChanged()
      ),
      this.totalQuestions$,
      this.quizService.getAllQuestions()
    ]).pipe(
      map(([correctAnswersCount, totalQuestions, questions]) => {
        return { correctAnswersCount, totalQuestions, questions };
      }),
      catchError((error: Error) => {
        console.error('Error in combineLatest in ScoreComponent:', error);
        return of({ correctAnswersCount: 0, totalQuestions: 0, questions: [] });
      })
    ).subscribe({
      next: ({ correctAnswersCount, totalQuestions, questions }) => {
        this.correctAnswersCount = correctAnswersCount;
        this.totalQuestions = totalQuestions;
        this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
      },
      error: (error) => console.error('Error in ScoreComponent subscription:', error),
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.currentScore$.complete();
    this.scoreSubscription?.unsubscribe();
  }

  toggleScoreDisplay(scoreType: 'numerical' | 'percentage'): void {
    this.isPercentage = scoreType === 'percentage';
    if (this.isPercentage) {
      this.displayPercentageScore();
    } else {
      this.displayNumericalScore();
    }
  }

  displayPercentageScore(): void {
    this.percentageScore = `${(
      (this.correctAnswersCount / this.totalQuestions) *
      100
    ).toFixed(2)}%`;
    this.currentScore$.next(this.percentageScore);
  }

  displayNumericalScore(): void {
    this.numericalScore = `${this.correctAnswersCount}/${this.totalQuestions}`;
    this.currentScore$.next(this.numericalScore);
  }
}
