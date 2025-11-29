import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { AsyncPipe, CommonModule, DecimalPipe } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { TimerService } from '../../../shared/services/timer.service';

enum TimerType {
  Countdown = 'countdown',
  Stopwatch = 'stopwatch'
}

@Component({
  selector: 'codelab-scoreboard-timer',
  standalone: true,
  imports: [CommonModule, MatMenuModule, AsyncPipe, DecimalPipe],
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimerComponent implements OnInit {
  timerType = TimerType;
  timePerQuestion = 30;
  currentTimerType = TimerType.Countdown;

  timeLeft$!: Observable<number>;

  constructor(private timerService: TimerService) {}

  ngOnInit(): void {
    this.timeLeft$ = this.timerService.elapsedTime$.pipe(
      map((elapsedTime) =>
        this.currentTimerType === TimerType.Countdown
          ? Math.max(this.timePerQuestion - elapsedTime, 0)
          : elapsedTime
      )
    );
  }

  setTimerType(type: TimerType): void {
    if (this.currentTimerType !== type) {
      this.currentTimerType = type;
    } else {
      console.log(`[TimerComponent] Timer type is already set to ${type}`);
    }
  }
}
