import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { concat, Observable, timer } from "rxjs";
import {
  first,
  repeatWhen,
  scan,
  skip,
  switchMapTo,
  take,
  takeUntil,
  tap
} from "rxjs/operators";

import { TimerService } from "../../../shared/services/timer.service";

@Component({
  selector: "codelab-scoreboard-time",
  templateUrl: "./time.component.html",
  styleUrls: ["./time.component.scss"]
})
export class TimeComponent implements OnChanges {
  @Input() selectedAnswer: number;
  answer: number;
  timePerQuestion = 20;
  timeLeft$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;

  constructor(private timerService: TimerService) {
    this.selectedAnswer = this.answer;
    this.countdownClock();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes.selectedAnswer &&
      changes.selectedAnswer.currentValue !== changes.selectedAnswer.firstChange
    ) {
      this.answer = changes.selectedAnswer.currentValue;
    }
  }

  countdownClock(): void {
    this.start$ = this.timerService.start$;
    this.reset$ = this.timerService.reset$;
    this.stop$ = this.timerService.stop$;

    this.timeLeft$ = concat(this.start$.pipe(first()), this.reset$)
      .pipe(
        switchMapTo(
          timer(0, 1000).pipe(
            scan(
              (acc: number) =>
                acc > 0 ? (acc - 1 >= 10 ? acc - 1 : `0${acc - 1}`) : acc,
              this.timePerQuestion
            )
          )
        ),
        takeUntil(this.stop$.pipe(skip(1))),
        repeatWhen(completeSubj =>
          completeSubj.pipe(
            switchMapTo(
              this.start$.pipe(
                skip(1),
                first()
              )
            )
          )
        )
      )
      .pipe(
        tap((value: number) =>
          this.timerService.setElapsed(this.timePerQuestion - value)
        )
      );
  }

  stopwatch(): void {
    this.start$ = this.timerService.start$;
    this.reset$ = this.timerService.reset$;
    this.stop$ = this.timerService.stop$;

    this.timeLeft$ = concat(this.start$.pipe(first()))
      .pipe(
        switchMapTo(
          timer(0, 1000).pipe(
            scan(acc => acc + 1, 0),
            take(this.timePerQuestion)
          )
        ),
        takeUntil(this.stop$.pipe(skip(1))),
        repeatWhen(completeSubj =>
          completeSubj.pipe(
            switchMapTo(
              this.start$.pipe(
                skip(1),
                first()
              )
            )
          )
        )
      )
      .pipe(tap((value: number) => this.timerService.setElapsed(value)));
  }
}
