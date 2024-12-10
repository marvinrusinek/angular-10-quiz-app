/* import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer } from 'rxjs';
import { scan, shareReplay, takeWhile } from 'rxjs/operators';

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
    return timer(0, 1000).pipe(
      scan((acc) => acc - 1, timePerQuestion), // Count down from `timePerQuestion`
      takeWhile((remaining) => remaining >= 0) // Stop at 0
    );
  }

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }
} */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { scan, takeUntil, tap, finalize } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class CountdownService {
  private isStop = new BehaviorSubject<void>(void 0);
  public elapsedTime = 0;

  constructor() {}

  startCountdown(timePerQuestion: number): Observable<number> {
    console.log('[CountdownService] Starting Countdown from', timePerQuestion, 'seconds.');

    // Stop any existing countdown before starting a new one
    this.stopCountdown();

    return timer(0, 1000).pipe(
      scan((acc) => acc - 1, timePerQuestion), // Count down from timePerQuestion
      takeUntil(this.isStop.asObservable()), // Stop when isStop emits
      tap((remaining: number) => {
        console.log('[CountdownService] Time remaining:', remaining);
        this.setElapsed(timePerQuestion - remaining);
      }),
      finalize(() => console.log('[CountdownService] Countdown completed.'))
    );
  }

  stopCountdown(): void {
    console.log('[CountdownService] Stopping Countdown...');
    this.isStop.next();
  }

  setElapsed(time: number): void {
    console.log('[CountdownService] Elapsed Time:', time);
    this.elapsedTime = time;
  }
}

