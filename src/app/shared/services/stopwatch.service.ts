import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, timer } from 'rxjs';
import { finalize, scan, shareReplay, skip, switchMapTo, take, takeUntil, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class StopwatchService {
  timePerQuestion = 30;
  time$: Observable<number>;
  start$: Observable<number>;
  reset$: Observable<number>;
  stop$: Observable<number>;
  concat$: Observable<number>;
  timeLeft$!: Observable<number>;
  elapsedTime = 0;
  isStopwatchRunning = false;

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

  startStopwatch(): Observable<number> {
    // Stop any existing timer before starting a new one
    this.isStop.next(1); // Emit stop signal to ensure cleanup of previous timers
  
    return this.concat$.pipe(
      switchMapTo(
        timer(0, 1000).pipe(
          scan((acc: number) => acc + 1, 0), // Increment counter
          take(this.timePerQuestion), // Stop after reaching the time limit
          finalize(() => {
            console.log('Stopwatch completed.');
          })
        )
      ),
      takeUntil(this.stop$.pipe(skip(1))), // Stop when stop signal is emitted
      tap((value: number) => this.setElapsed(value)) // Update elapsed time
    );
  }

  setElapsed(time: number): void {
    this.elapsedTime = time;
  }
}
