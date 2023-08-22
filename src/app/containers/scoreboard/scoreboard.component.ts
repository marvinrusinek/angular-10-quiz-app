import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges
} from '@angular/core';
import { ActivatedRoute, Params } from '@angular/router';
import { ReplaySubject, Subject, throwError } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

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
  badgeText: string;
  unsubscribe$ = new Subject<void>();
  private totalQuestions$ = new ReplaySubject<number>(1);

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.activatedRoute.params
      .pipe(
        takeUntil(this.unsubscribe$),
        catchError((error) => {
          console.error('Failed to get question index', error);
          return throwError('Failed to get question index');
        })
      )
      .subscribe((params: Params) => {
        if (params.questionIndex !== undefined) {
          this.questionNumber = +params.questionIndex;
          this.timerService.resetTimer();
          this.quizService.totalQuestions$
            .pipe(
              takeUntil(this.unsubscribe$),
              catchError((error) => {
                console.error('Failed to get total questions', error);
                return throwError('Failed to get total questions');
              })
            )
            .subscribe((totalQuestions) => {
              this.totalQuestions$.next(totalQuestions);
              this.updateBadgeText(this.questionNumber, totalQuestions);
            });
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

    // Update totalQuestions$ ReplaySubject with the current totalQuestions value
    if (changes.totalQuestions) {
      this.totalQuestions$.next(changes.totalQuestions.currentValue);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  updateBadgeText(questionNumber: number, totalQuestions: number): void {
    if (questionNumber && totalQuestions > 0) {
      this.badgeText =
        'Question ' + questionNumber + ' of ' + totalQuestions;
    } else {
      this.badgeText = '';
    }
  }
}
