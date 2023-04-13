import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { concat, Observable } from 'rxjs';
import { first } from 'rxjs/operators';

import { TimerService } from '../../../shared/services/timer.service';
import { CountdownService } from '../../../shared/services/countdown.service';
import { StopwatchService } from '../../../shared/services/stopwatch.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch',
}

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimerComponent implements OnInit, OnChanges {
  @Input() selectedAnswer: number;
  timerType = TimerType;
  timeLeft$: Observable<number>;
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
    this.timeLeft$ = this.countdownService.startCountdown(30);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }

  setTimerType(type: TimerType) {
    switch (type) {
      case TimerType.Countdown:
        this.timeLeft$ = this.countdownService.startCountdown();
        break;
      case TimerType.Stopwatch:
        this.timeLeft$ = this.stopwatchService.startStopwatch();
        break;
      default:
        console.error(`Invalid timer type: ${type}`);
    }
  }
}
