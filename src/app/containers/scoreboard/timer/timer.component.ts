import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
  timePerQuestion = 30;
  currentTimerType = TimerType.Countdown;

  timeLeft$!: Observable<number>;

  constructor(
    private timerService: TimerService, 
    private countdownService: CountdownService,
    private stopwatchService: StopwatchService
  ) {}

  ngOnInit(): void {
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) =>
        this.currentTimerType === TimerType.Countdown
          ? Math.max(this.timePerQuestion - elapsedTime, 0)
          : elapsedTime
      )
    );
  }

  switchToStopwatch(): void {
    console.log('[QuizComponent] Switching to Stopwatch...');
    this.countdownService.stopCountdown(); // Stop the countdown
    this.stopwatchService.startStopwatch().subscribe();
  }

  switchToCountdown(timePerQuestion: number = 30): void {
    console.log('[QuizComponent] Switching to Countdown...');
    this.stopwatchService.stopStopwatch(); // Stop the stopwatch
    this.countdownService.startCountdown(timePerQuestion).subscribe();
  }
}
