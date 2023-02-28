import { Injectable, Input } from '@angular/core';
import { concat, BehaviorSubject, interval, Observable, of, timer } from 'rxjs';
import {
  first,
  repeatWhen,
  scan,
  shareReplay,
  skip,
  switchMapTo,
  takeUntil,
  tap,
} from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class CountdownService {
  @Input() selectedAnswer: number;
  answer: number;
  timePerQuestion = 30;
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;
  timeLeft$: Observable<number>;
  elapsedTime = 0;

  timer: Observable<number>;
  isStart = new BehaviorSubject<number>(1);
  isStop = new BehaviorSubject<number>(1);
  isReset = new BehaviorSubject<number>(1);
  isTimerStart = false;

  constructor() {
    this.start$ = this.isStart.asObservable().pipe(shareReplay(1));
    this.reset$ = this.isReset.asObservable();
    this.stop$ = this.isStop.asObservable();
    this.concat$ = of(null);
  }

  startCountdown(duration: number = 30): Observable<number> {
    return this.concat$
      .pipe(
        switchMapTo(
          timer(0, 1000).pipe(
            scan((acc) => {
              if (acc > 0) {
                return acc - 1;
              }
              return acc;
            }, this.timePerQuestion)
          )
        ),
        takeUntil(this.stop$.pipe(skip(1))),
        repeatWhen((completeSubj) =>
          completeSubj.pipe(switchMapTo(this.start$.pipe(skip(1), first())))
        )
      )
      .pipe(
        tap((value: number) => this.setElapsed(this.timePerQuestion - value))
      );
  }

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }
}
