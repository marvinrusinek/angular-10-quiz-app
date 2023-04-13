import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReplaySubject, Subject } from 'rxjs';
import { delay, takeUntil, tap } from 'rxjs/operators';

import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-scoreboard',
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoreboardComponent implements OnInit, OnChanges, OnDestroy {
  @Input() selectedAnswer: number;
  answer: number;
  totalQuestions: number;
  questionNumber: number;
  badge: string;
  unsubscribe$ = new Subject<void>();
  private totalQuestions$ = new ReplaySubject<number>(1);

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.selectedAnswer = this.answer;

    this.quizService.totalQuestions$
      .pipe(
        delay(10),
        tap((totalQuestions) => {
          this.totalQuestions$.next(totalQuestions);
          this.ngZone.run(() => {
            this.updateBadge(totalQuestions);
          });
        })
      )
      .subscribe();

    this.totalQuestions$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((totalQuestions) => {
        this.totalQuestions = totalQuestions;
        this.updateBadge();
      });

    this.activatedRoute.params
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((params) => {
        if (params.questionIndex) {
          this.questionNumber = params.questionIndex;
          this.timerService.resetTimer();
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }

    // Update totalQuestions$ BehaviorSubject with the current totalQuestions value
    if (changes.totalQuestions) {
      this.totalQuestions$.next(changes.totalQuestions.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  updateBadge(totalQuestions: number): void {
    if (this.questionNumber && totalQuestions > 0) {
      this.badge =
        'Question ' + this.questionNumber + ' of ' + totalQuestions;
    }
  }
}
