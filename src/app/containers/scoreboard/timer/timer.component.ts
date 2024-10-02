import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { concat, Observable } from 'rxjs';
import { catchError, first, map } from 'rxjs/operators';

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
  answer = 0;
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
    ).pipe(
      catchError(err => {
        console.error('Error in concat$', err);
        return [];
      })
    ) as Observable<number>;
  
    // Default timer setup
    this.setTimerType(this.timerType.Countdown);
  }

  /**
   * Sets the current timer type and updates the timeLeft$ observable accordingly.
   * @param type - The type of timer to set (Countdown or Stopwatch).
   */
  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
      this.timeLeft$ = this.getTimeObservable(type);
    }
  }

  /**
   * Returns the appropriate observable based on the timer type.
   * @param type - The type of timer (Countdown or Stopwatch).
   * @returns An observable that emits the time left.
   * @throws Will throw an error if the timer type is invalid.
   */
  private getTimeObservable(type: TimerType): Observable<number> {
    switch (type) {
      case TimerType.Countdown:
        return this.countdownService.startCountdown(this.timePerQuestion);
      case TimerType.Stopwatch:
        return this.stopwatchService.startStopwatch();
      default:
        throw new Error(`Invalid timer type: ${type}`);
    }
  }
}
