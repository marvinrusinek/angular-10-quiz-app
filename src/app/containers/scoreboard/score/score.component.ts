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
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(
    0
  );
  score = '';
  numericalScore = '0/0';
  percentageScore = '';
  isPercentage = false;
  percentage = 0;

  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.numericalScore
  );
  subscription: Subscription;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(private quizService: QuizService) {
    this.totalQuestions$ = this.quizService.getTotalQuestions();
  }

  ngOnInit(): void {
    this.isPercentage = true;

    this.subscription = combineLatest([
      this.correctAnswersCount$.pipe(
        takeUntil(this.unsubscribeTrigger$),
        distinctUntilChanged()
      ),
      this.quizService.getAllQuestions().pipe(
        switchMap((questions: QuizQuestion[]) =>
          this.quizService.getTotalQuestions().pipe(
            map((totalQuestions: number) => [questions, totalQuestions] as [QuizQuestion[], number])
          )
        ),
        catchError((error: Error) => {
          console.error('Error in getQuestions():', error);
          return of([[], undefined] as [QuizQuestion[], number]);
        })
      ),
    ]).subscribe({
      next: ([correctAnswersCount, [questions, totalQuestions]]: [number, [QuizQuestion[], number]]) => {
        this.correctAnswersCount = correctAnswersCount;
        this.totalQuestions = totalQuestions;
        this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
      },
      error: (error) => {
        console.error('Error in ScoreComponent subscription:', error);
      },
    });    
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.unsubscribeTrigger$.next();
    this.unsubscribeTrigger$.complete();
    this.currentScore$.complete();
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
