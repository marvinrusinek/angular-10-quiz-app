import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { concat, Observable } from 'rxjs';
import { first, map } from 'rxjs/operators';

import { TimerService } from '../../../shared/services/timer.service';
import { CountdownService } from '../../../shared/services/countdown.service';
import { StopwatchService } from '../../../shared/services/stopwatch.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch'
}

@Component({
  selector: 'codelab-scoreboard-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimerComponent implements OnInit {
  timerType = TimerType;
  timeLeft$!: Observable<number>;
  answer: number;
  timePerQuestion = 30;
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;
  currentTimerType: TimerType;

  constructor(
    private timerService: TimerService,
    private countdownService: CountdownService,
    private stopwatchService: StopwatchService
  ) {}

  ngOnInit(): void {
    this.start$ = this.timerService.start$;
    this.reset$ = this.timerService.reset$;
    this.stop$ = this.timerService.stop$;
    this.concat$ = concat(
      this.start$.pipe(first(), map(value => +value)),
      this.reset$.pipe(first(), map(value => +value))
    ) as Observable<number>;
  
    // Default timer setup
    this.setTimerType(this.timerType.Countdown);
  }

  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      switch (type) {
        case TimerType.Countdown:
          this.timeLeft$ = this.countdownService.startCountdown(this.timePerQuestion);
          break;
        case TimerType.Stopwatch:
          this.timeLeft$ = this.stopwatchService.startStopwatch();
          break;
        default:
          console.error(`Invalid timer type: ${type}`);
      }
    }
  }
}
