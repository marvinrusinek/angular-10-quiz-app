import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, timer } from 'rxjs';
import { finalize, map, takeUntil, tap } from 'rxjs/operators';

import { SelectedOptionService } from './selectedoption.service';
import { QuizService } from './quiz.service';

interface StopTimerAttemptOptions {
  questionIndex?: number;
  onStop?: (elapsedTime: number) => void;
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  timePerQuestion = 30;
  private currentDuration = this.timePerQuestion;
  private elapsedTime = 0;
  completionTime: number;
  elapsedTimes: number[] = [];

  isTimerRunning = false;  // tracks whether the timer is currently running
  isCountdown = true;  // tracks the timer mode (true = countdown, false = stopwatch)
  isTimerStoppedForCurrentQuestion = false;

  // Signals
  private isStop = new Subject<void>();
  private isReset = new Subject<void>();

  public start$: Observable<number>;

  // Observables
  private elapsedTimeSubject = new BehaviorSubject<number>(0);
  public elapsedTime$ = this.elapsedTimeSubject.asObservable();

  // Consolidated stop/reset using BehaviorSubjects
  private stopSubject = new BehaviorSubject<void>(undefined);
  private resetSubject = new BehaviorSubject<void>(undefined);
  public stop$ = this.stopSubject.asObservable().pipe(map(() => 0));
  public reset$ = this.resetSubject.asObservable().pipe(map(() => 0));

  // Timer observable
  timer$: Observable<number>;
  private timerSubscription: Subscription | null = null;
  private stopTimerSignalSubscription: Subscription | null = null;

  private expiredSubject = new Subject<void>();
  public expired$ = this.expiredSubject.asObservable();

  // Expiry that includes the question index
  private expiredIndexSubject = new Subject<number>();
  public expiredIndex$ = this.expiredIndexSubject.asObservable();

  constructor(
    private ngZone: NgZone,
    private selectedOptionService: SelectedOptionService,
    private quizService: QuizService
  ) {
    this.stopTimerSignalSubscription = this.selectedOptionService.stopTimer$.subscribe(() => {
      if (!this.isTimerRunning) {
        console.log('[TimerService] Stop signal received but timer is not running.');
        return;
      }

      console.log('[TimerService] Stop signal received from SelectedOptionService. Stopping timer.');
      this.stopTimer(undefined, { force: true });
    });
    this.listenForCorrectSelections();
  }

  ngOnDestroy(): void {
    this.timerSubscription?.unsubscribe();
    this.stopTimerSignalSubscription?.unsubscribe();
  }

  private listenForCorrectSelections(): void {
    this.stopTimerSignalSubscription =
      this.selectedOptionService.stopTimer$.subscribe(() => {
        if (!this.isTimerRunning) {
          console.log('[TimerService] Stop signal received but timer is not running.');
          return;
        }
        this.handleStopTimerSignal();
      });
  }  

  private handleStopTimerSignal(): void {
    if (!this.isTimerRunning) {
      console.log('[TimerService] Stop signal received but timer is not running.');
      return;
    }

    const activeQuestionIndex = this.quizService?.currentQuestionIndex ?? -1;
    if (activeQuestionIndex < 0) {
      console.warn(
        '[TimerService] Stop signal received without a valid question index. Forcing timer stop.'
      );
      this.stopTimer(undefined, { force: true });
      return;
    }

    const stopped = this.attemptStopTimerForQuestion({
      questionIndex: activeQuestionIndex,
      onStop: (elapsed) => {
        this.elapsedTimes[activeQuestionIndex] = elapsed;
      },
    });

    if (!stopped) {
      console.warn(
        '[TimerService] Stop signal received but automatic stop was rejected. Forcing timer stop.'
      );
      this.stopTimer(undefined, { force: true });
    }
  }

  // Starts the timer
  startTimer(duration: number = this.timePerQuestion, isCountdown: boolean = true): void {
    if (this.isTimerStoppedForCurrentQuestion) {
      console.log(`[TimerService] ⚠️ Timer restart prevented.`);
      return;
    }
  
    if (this.isTimerRunning) {
      console.info('[TimerService] Timer is already running. Start ignored.');
      return;  // prevent restarting an already running timer
    }
  
    this.isTimerRunning = true;  // mark timer as running
    this.isCountdown = isCountdown;
    this.elapsedTime = 0;
  
    // Show initial value immediately (inside Angular so UI updates right away)
    this.ngZone.run(() => {
      this.elapsedTimeSubject.next(0);
    });
  
    // Start ticking after 1s so the initial value stays visible for a second
    const timer$ = timer(1000, 1000).pipe(
      tap((tick) => {
        // Tick starts at 0 after 1s → elapsed = tick + 1 (1,2,3,…)
        const elapsed = tick + 1;

        // Internal state can be outside Angular
        this.elapsedTime = elapsed;
  
        // Re-enter Angular so async pipes trigger change detection on every tick
        this.ngZone.run(() => {
          this.elapsedTimeSubject.next(this.elapsedTime);
        });
  
        // If in countdown mode and reached the duration, stop automatically
        if (isCountdown && elapsed >= duration) {
          console.log('[TimerService] Time expired. Stopping timer.');
          this.ngZone.run(() => this.expiredSubject.next());
          this.stopTimer(undefined, { force: true });
        }
      }),
      takeUntil(this.isStop),
      finalize(() => {
        console.log('[TimerService] Timer finalized.');
        // Reset running state when timer completes (inside Angular)
        this.ngZone.run(() => { this.isTimerRunning = false; });
      })
    );
  
    this.timerSubscription = timer$.subscribe();
    console.log('[TimerService] Timer started successfully.');
  }

  // Stops the timer
  stopTimer(
    callback?: (elapsedTime: number) => void,
    options: { force?: boolean } = {}
  ): void {
    const shouldForce = !!options.force;
    console.log('Entered stopTimer(). Timer running:', this.isTimerRunning);

    if (!this.isTimerRunning) {
      console.log('Timer is not running. Nothing to stop.');
      return;
    }

    // End the ticking subscription
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
      console.log('Timer subscription cleared.');
    } else {
      console.warn('No active timer subscription to unsubscribe.');
    }

    this.isTimerRunning = false;  // mark the timer as stopped
    this.isTimerStoppedForCurrentQuestion = true;  // prevent restart for current question
    this.stopSubject.next();  // emit stop signal to stop the timer
    this.isStop.next();

    if (callback) {
      callback(this.elapsedTime);
      console.log('Elapsed time recorded in callback:', this.elapsedTime);
    }

    console.log('Timer stopped successfully.');
  }

  // Pause without marking "stopped for current question" so resume works
  pauseTimer(): void {
    if (!this.isTimerRunning) return;
    console.log('[TimerService] Pausing at', this.elapsedTime, 's');
    this.isTimerRunning = false;
    this.timerSubscription?.unsubscribe();
    this.timerSubscription = null;
  }

  // Resets the timer
  resetTimer(): void {
    console.log('Attempting to reset timer...');
    if (this.isTimerRunning) {
      console.log('Timer is running. Stopping before resetting...');
      this.stopTimer(undefined, { force: true });
    }

    this.elapsedTime = 0;
    this.isTimerRunning = false;
    this.isTimerStoppedForCurrentQuestion = false;  // allow restart for the new question

    this.isReset.next();  // signal to reset
    this.elapsedTimeSubject.next(0);  // reset elapsed time for observers
    console.log('Timer reset successfully.');
  }

  // Resume from remaining time (countdown only). If stopwatch mode, skip the check.
  resumeTimer(): void {
    if (this.isTimerRunning) return;

    if (this.isCountdown) {
      const remaining = Math.max(this.currentDuration - this.elapsedTime, 0);
      if (remaining <= 0) {
        console.log('[TimerService] Resume skipped (no time remaining).');
        return;
      }
      console.log('[TimerService] Resuming with', remaining, 's left');
      // Start a fresh countdown for the remaining seconds
      this.startTimer(remaining, true);
    } else {
      // Stopwatch mode: just start in stopwatch mode again (elapsed will restart from 0)
      console.log('[TimerService] Resuming stopwatch');
      this.startTimer(this.timePerQuestion, false);
    }
  }

  attemptStopTimerForQuestion(
    options: StopTimerAttemptOptions = {}
  ): boolean {
    const questionIndex =
      typeof options.questionIndex === 'number'
        ? options.questionIndex
        : this.quizService?.currentQuestionIndex ?? null;

    if (this.selectedOptionService.stopTimerEmitted) {
      console.log(
        '[TimerService] attemptStopTimerForQuestion skipped — timer already stopped for this question.'
      );
      return false;
    }

    if (questionIndex == null || questionIndex < 0) {
      console.warn(
        '[TimerService] attemptStopTimerForQuestion called without a valid question index.'
      );
      return false;
    }

    const allCorrectSelected =
      this.selectedOptionService.areAllCorrectAnswersSelectedSync(questionIndex);

    if (!allCorrectSelected) {
      console.log(
        '[TimerService] attemptStopTimerForQuestion rejected — correct answers not fully selected yet.',
        { questionIndex }
      );
      return false;
    }

    this.stopTimer(options.onStop);
    this.selectedOptionService.stopTimerEmitted = true;

    return true;
  }

  preventRestartForCurrentQuestion(): void {
    if (this.isTimerStoppedForCurrentQuestion) {
      console.warn(`[TimerService] ⚠️ Timer restart prevented.`);
      return;
    }

    // Mark the timer as stopped and prevent restart
    this.isTimerStoppedForCurrentQuestion = true;
    console.log(`[TimerService] ✅ Timer stop recorded.`);
  }

  // Sets a custom elapsed time
  setElapsed(time: number): void {
    this.elapsedTime = time;
  }

  // Calculates the total elapsed time from recorded times
  calculateTotalElapsedTime(elapsedTimes: number[]): number {
    if (elapsedTimes.length > 0) {
      this.completionTime = elapsedTimes.reduce((acc, cur) => acc + cur, 0);
      return this.completionTime;
    }
    return 0;
  }
}