import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  Subject,
  Subscription,
  timer,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  switchMap,
  takeUntil,
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

  currentScore = '';
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.numericalScore
  );
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  subscription: Subscription;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(private quizService: QuizService, private ngZone: NgZone) {
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
        switchMap((questions) =>
          combineLatest([of(questions), this.quizService.getTotalQuestions()])
        ),
        catchError((error) => {
          console.error('Error in getQuestions():', error);
          return of([]);
        })
      ),
    ]).subscribe(
      ([correctAnswersCount, [questions, totalQuestions]]) => {
        this.correctAnswersCount = correctAnswersCount;
        this.totalQuestions = totalQuestions;
        this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
        this.ngZone.run(() => {
          timer(0).subscribe(() => {
            this.displayNumericalScore();
          });
        });
      },
      (error) => {
        console.error('Error in ScoreComponent subscription:', error);
      }
    );
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
