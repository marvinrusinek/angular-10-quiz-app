import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { concat, Observable, timer } from 'rxjs';
import {
  first,
  repeatWhen,
  scan,
  skip,
  switchMapTo,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { TimerService } from '../../../shared/services/timer.service';
import { CountdownService } from '../../../shared/services/countdown.service';
import { StopwatchService } from '../../../shared/services/stopwatch.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch',
}

@Component({
  selector: 'codelab-scoreboard-time',
  templateUrl: './time.component.html',
  styleUrls: ['./time.component.scss'],
})
export class TimeComponent implements OnInit, OnChanges {
  timerType = TimerType;
  timeLeft$: Observable<number>;

  @Input() selectedAnswer: number;
  answer: number;
  timePerQuestion = 30;
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;

  constructor(
    private timerService: TimerService,
    private countdownService: CountdownService,
    private stopwatchService: StopwatchService
  ) {}

  ngOnInit(): void {
    this.selectedAnswer = this.answer;
    this.start$ = this.timerService.start$;
    this.reset$ = this.timerService.reset$;
    this.stop$ = this.timerService.stop$;
    this.concat$ = concat(this.start$.pipe(first()), this.reset$);
    this.timeLeft$ = this.countdownService.startCountdown();
  }

  setTimerType(type: TimerType) {
    switch (type) {
      case TimerType.Countdown:
        // logic for setting countdown timer
        this.timeLeft$ = this.countdownService.startCountdown();
        break;
      case TimerType.Stopwatch:
        // logic for setting stopwatch timer
        this.timeLeft$ = this.stopwatchService.startStopwatch();
        break;
      default:
        console.error(`Invalid timer type: ${type}`);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }
}
