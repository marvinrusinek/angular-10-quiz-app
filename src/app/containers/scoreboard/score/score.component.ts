import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnDestroy,
  NgZone
} from '@angular/core';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  Subject,
  Subscription,
  timer
} from 'rxjs';
import { distinctUntilChanged, switchMap, takeUntil, tap } from 'rxjs/operators';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';

@Component({
  selector: 'codelab-scoreboard-score',
  templateUrl: './score.component.html',
  styleUrls: ['./score.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScoreComponent implements OnInit, OnDestroy {
  @Input() correctAnswersCount: number = 0;
  @Input() totalQuestions: number = 0;
  questions$: Observable<QuizQuestion[]>;
  totalQuestions$: Observable<number>;
  correctAnswersCount$: BehaviorSubject<number> = new BehaviorSubject<number>(
    0
  );
  score: string;
  numericalScore: string = '0/0';
  percentageScore: string;
  isPercentage: boolean = false;
  percentage: number = 0;

  currentScore: string;
  currentScore$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.numericalScore
  );
  currentScoreSubject: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );

  subscription: Subscription;
  numericalScoreSubscription: Subscription;
  percentageScoreSubscription: Subscription;
  percentageScore$: BehaviorSubject<string>;
  numericalScore$: BehaviorSubject<string>;

  private unsubscribeTrigger$: Subject<void> = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private ngZone: NgZone
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

    this.subscription = combineLatest([
      this.correctAnswersCount$.pipe(
        takeUntil(this.unsubscribeTrigger$), 
        distinctUntilChanged()
      ),
      this.quizService.getQuestions().pipe(
        tap((questions) => (this.questions$ = of(questions))),
        switchMap((questions) =>
          combineLatest([of(questions), this.quizService.getTotalQuestions()])
        )
      )
    ]).subscribe(([correctAnswersCount, [questions, totalQuestions]]) => {
      this.correctAnswersCount = correctAnswersCount;
      this.totalQuestions = totalQuestions;
      this.numericalScore = `${this.correctAnswersCount}/${totalQuestions}`;
      this.ngZone.run(() => {
        timer(0).subscribe(() => {
          this.displayNumericalScore();
        });
      });
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.numericalScoreSubscription?.unsubscribe();
    this.percentageScoreSubscription?.unsubscribe();
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
