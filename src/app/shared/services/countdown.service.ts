import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer } from 'rxjs';
import { first, repeatWhen, scan, shareReplay, skip, switchMapTo, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CountdownService {
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;
  timeLeft$!: Observable<number>;
  elapsedTime = 0;

  timer: Observable<number>;
  isStart = new BehaviorSubject<number>(1);
  isStop = new BehaviorSubject<number>(1);
  isReset = new BehaviorSubject<number>(1);

  constructor() {
    this.start$ = this.isStart.asObservable().pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.reset$ = this.isReset.asObservable();
    this.stop$ = this.isStop.asObservable();
    this.concat$ = of(null);
  }

  startCountdown(timePerQuestion: number): Observable<number> {
    return this.concat$
      .pipe(
        // Switch to a new countdown timer whenever `concat$` emits.
        switchMapTo(
          timer(0, 1000).pipe(
            // Decrease the counter or stop at 0.
            scan((acc: number) => Math.max(0, acc - 1), timePerQuestion)
          )
        ),
        // Stop the countdown when `stop$` emits.
        takeUntil(this.stop$.pipe(skip(1))),
        // Restart the countdown when `start$` emits after the first complete signal.
        repeatWhen((completeSubj: Observable<void>) => 
          completeSubj.pipe(
            switchMapTo(this.start$.pipe(first()))
          )
        ),
        // Update the remaining time.
        tap((remaining: number) => this.setElapsed(remaining))
      );
  }

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }
}
