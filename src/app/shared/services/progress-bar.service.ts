import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, take, takeUntil, takeUntilDestroyed } from 'rxjs/operators';

import { QuizService } from './quiz.service'; 
import { QuizStateService } from './quizstate.service';

@Injectable({ providedIn: 'root' })
export class ProgressBarService implements OnDestroy {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();
  private hasNavigatedPastQ1 = false;
  private hasManuallyMarkedQ1Complete = false;
  private hasMarkedQ1Complete = false;

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService, 
    private router: Router) {}

  private destroy$ = new Subject<void>();
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Method to update the progress
  /* setProgress(progress: number): void {
    this.progressPercentageSubject.next(progress); // emit the new progress value
  } */
  setProgress(progress: number): void {
    const isQ1 = this.quizService.getCurrentQuestionIndex?.() === 0;
    if (isQ1 && !this.hasMarkedQ1Complete) {
      console.warn('[🛑 Progress Blocked inside setProgress()] Still on Q1');
      return;
    }
  
    this.progressPercentageSubject.next(progress);
  }
  

  /* updateProgress(currentIndex: number, totalQuestions: number): void {
    const percent = currentIndex === 0 ? 0 : Math.floor((currentIndex / totalQuestions) * 100);
    this.progressPercentageSubject.next(percent); // emit through BehaviorSubject
  } */
  /* updateProgress(currentIndex: number, totalQuestions: number): void {
    const percent = currentIndex === 0
      ? 0
      : Math.floor((currentIndex / totalQuestions) * 100);
    
    this.progressPercentageSubject.next(percent);
  } */
  /* updateProgress(currentIndex: number, totalQuestions: number): void {
    if (currentIndex === 0) {
      console.log('[⏸️ Progress Update] Still on Q1 → 0%');
      this.progressPercentageSubject.next(0);
      return;
    }
  
    const safeTotal = totalQuestions > 0 ? totalQuestions : 1;
    const percent = Math.round((currentIndex / safeTotal) * 100);
    console.log(`[📊 Progress Updated] Q${currentIndex + 1} of ${safeTotal} = ${percent}%`);
    this.progressPercentageSubject.next(percent);
  } */
  /* updateProgress(currentIndex: number, totalQuestions: number): void {
    if (totalQuestions <= 0) {
      this.progressPercentageSubject.next(0);
      return;
    }
  
    const percent = currentIndex === 0 ? 0 : Math.round((currentIndex / totalQuestions) * 100);
    this.progressPercentageSubject.next(percent);
    console.log(`[📊 Progress] Q${currentIndex + 1}/${totalQuestions} → ${percent}%`);
  } */
  updateProgress(currentIndex: number, totalQuestions: number): void {
    if (!totalQuestions || totalQuestions <= 0) {
      this.progressPercentageSubject.next(0);
      return;
    }
  
    // Clamp index (don't go over 100%)
    const clampedIndex = Math.min(currentIndex, totalQuestions);
    const percent = Math.round((clampedIndex / totalQuestions) * 100);
  
    this.progressPercentageSubject.next(percent);
    console.log(`[📊 Progress Updated] Q${currentIndex + 1}/${totalQuestions} = ${percent}%`);
  }
  


  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // always start at 0%
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
      .pipe(
        debounceTime(50), // avoid mid-navigation emissions
        distinctUntilChanged((prev, curr) => prev[1] === curr[1]),
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index]) => {
        if (totalQuestions > 0) {
          const adjustedIndex = index === 0 ? 0 : index;
          const raw = (adjustedIndex / totalQuestions) * 100;
          const percentage = parseFloat(raw.toFixed(0));
          this.setProgress(percentage);
        } else {
          this.setProgress(0);
        }
      });      
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0);

    // Track router navigation completions
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      debounceTime(50), // let Angular stabilize
      takeUntil(this.destroy$)
    ).subscribe(() => {
      // Get the updated index AFTER route change
      combineLatest([
        this.quizService.getTotalQuestionsCount(quizId),
        this.quizService.currentQuestionIndex$
      ])
        .pipe(take(1)) // prevent lingering
        .subscribe(([totalQuestions, index]) => {
          if (index === 0) {
            console.warn('[📊 Progress Suppressed] Still on Q1, forcing 0%');
            this.setProgress(0);
            return;
          }

          if (totalQuestions > 0) {
            const raw = (index / totalQuestions) * 100;
            const percentage = parseFloat(raw.toFixed(0));
            console.log(`[✅ Progress Updated] ${percentage} %`);
            this.setProgress(percentage);
          } else {
            this.setProgress(0);
          }
        });
    });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0);

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      debounceTime(50),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      combineLatest([
        this.quizService.getTotalQuestionsCount(quizId),
        this.quizService.currentQuestionIndex$
      ])
        .pipe(take(1))
        .subscribe(([totalQuestions, index]) => {
          if (index === 0) {
            console.log('[📊 Progress] Q1 detected, setting 0%');
            this.setProgress(0);
          } else if (totalQuestions > 0) {
            const percent = Math.round((index / totalQuestions) * 100);
            console.log(`[📊 Progress] Q${index + 1}/${totalQuestions} → ${percent}%`);
            this.setProgress(percent);
          }
        });
    });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // Always start at 0%

    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.quizService.getCurrentQuestionIndex()),
        distinctUntilChanged()
      )
    ])
    .pipe(takeUntilDestroyed())
    .subscribe(([totalQuestions, index]) => {
      console.log('[🔁 NAVIGATION END] Confirmed index:', index);

      if (index === 0) {
        console.log('[🚫 Progress] Still on Q1 → Forcing 0%');
        this.setProgress(0);
        return;
      }

      const percentage = Math.round((index / totalQuestions) * 100);
      console.log(`[✅ Progress Updated] ${percentage}% at Q${index + 1}`);
      this.setProgress(percentage);
    });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // Always start at 0%

    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.quizService.getCurrentQuestionIndex()),
        distinctUntilChanged()
      )
    ])
    .pipe(takeUntilDestroyed())
    .subscribe(([totalQuestions, index]) => {
      const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
      
      if (index === 0 && !isNavigating) {
        console.log('[📊 Progress Suppressed] Still on Q1, keeping 0%');
        this.setProgress(0);
        return;
      }
    
      if (totalQuestions > 0) {
        const raw = (index / totalQuestions) * 100;
        const percentage = parseFloat(raw.toFixed(0));
        console.log('[✅ Progress Updated]', percentage, '%');
        this.setProgress(percentage);
      } else {
        this.setProgress(0);
      }
    });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // start at 0%
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$,
      this.quizStateService.isNavigatingSubject.asObservable()
    ])
      .pipe(
        debounceTime(50),
        distinctUntilChanged((prev, curr) => prev[1] === curr[1]), // only react to index changes
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index, isNavigating]) => {
        if (index === 0 && !isNavigating) {
          console.log('[📊 Suppress] Q1 option click – forcing 0%');
          this.setProgress(0);
          return;
        }
  
        if (totalQuestions > 0) {
          const raw = (index / totalQuestions) * 100;
          const percentage = parseFloat(raw.toFixed(0));
          console.log('[✅ Progress Updated]', percentage, '%');
          this.setProgress(percentage);
        } else {
          this.setProgress(0);
        }
      });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // Always start at 0%
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$,
      this.quizStateService.isNavigatingSubject.asObservable()
    ])
      .pipe(
        debounceTime(50),
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index, isNavigating]) => {
        if (index === 0 && !this.hasNavigatedPastQ1) {
          // 🚫 Suppress progress update for Q1 option clicks
          console.log('[⛔ Suppress Progress] Still on Q1 — forcing 0%');
          this.setProgress(0);
          return;
        }
  
        if (totalQuestions > 0) {
          const percentage = Math.round((index / totalQuestions) * 100);
          console.log(`[✅ Progress Updated] index=${index}, percent=${percentage}%`);
          this.setProgress(percentage);
        } else {
          this.setProgress(0);
        }
      });
  } */
  /* public initializeProgressTracking(quizId: string): void {
    this.setProgress(0);
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
      .pipe(
        debounceTime(50),
        distinctUntilChanged((prev, curr) => prev[1] === curr[1]),
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index]) => {
        console.log('[📊 Progress Update Triggered]', { index, totalQuestions, hasNavigatedPastQ1: this.hasNavigatedPastQ1 });
  
        // ❌ Suppress progress update for Q1 unless auto-advance happened
        if (index === 0 && !this.hasNavigatedPastQ1) {
          console.warn('[🚫 Progress Suppressed for Q1]');
          this.setProgress(0);
          return;
        }
  
        if (totalQuestions > 0) {
          const raw = (index / totalQuestions) * 100;
          const percentage = parseFloat(raw.toFixed(0));
          this.setProgress(percentage);
          console.log('[✅ Progress Set]', percentage, '%');
        } else {
          this.setProgress(0);
        }
      });
  } */
  /* initializeProgressTracking(quizId: string): void {
    this.setProgress(0);

    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
      .pipe(
        debounceTime(50),
        distinctUntilChanged(([, prevIdx], [, currIdx]) => prevIdx === currIdx),
        filter(([_, index]) => index > 0), // 👈 Ignore Q1 (index 0)
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index]) => {
        const percentage = Math.round((index / totalQuestions) * 100);
        console.log(`[📊 Progress Tracking] index=${index}, total=${totalQuestions}, %=${percentage}`);
        this.progressPercentageSubject.next(percentage);
      });
  } */
  /* public initializeProgressTracking(quizId: string): void {
    this.setProgress(0);
    this.hasMarkedQ1Complete = false;
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
    .pipe(takeUntil(this.destroy$))
    .subscribe(([totalQuestions, index]) => {
      console.log('[🧪 currentQuestionIndex$ Emitted]', { index, totalQuestions });
    
      const isFirstQuestion = index === 0;
      const hasLeftQ1 = this.hasMarkedQ1Complete;
    
      if (isFirstQuestion && !hasLeftQ1) {
        console.log('[📊 Suppressed] Still on Q1 — forcing 0%');
        this.setProgress(0);
        return;
      }
    
      const raw = (index / totalQuestions) * 100;
      const percentage = Math.round(raw);
      this.setProgress(percentage);
      console.log(`[✅ Progress Updated] ${percentage}%`);
    });    
  } */
  public initializeProgressTracking(quizId: string): void {
    this.setProgress(0);
    this.hasMarkedQ1Complete = false;
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
    .pipe(takeUntil(this.destroy$))
    .subscribe(([totalQuestions, index]) => {
      const isFirstQuestion = index === 0;
  
      if (isFirstQuestion && !this.hasMarkedQ1Complete) {
        console.log('[📊 Q1 Progress Suppressed] Forcing 0%');
        this.setProgress(0); // keep at 0%
        return;
      }
  
      const percent = Math.round((index / totalQuestions) * 100);
      this.setProgress(percent);
      console.log(`[✅ Progress Updated] ${percent}%`);
    });
  }
  
  

  // Manually update progress percentage (0–100) based on current index
  /* setProgressManually(currentIndex: number): void {
    const quiz = this.quizService.getActiveQuiz();
    const totalQuestions = quiz?.questions?.length ?? 0;

    if (totalQuestions <= 0) {
      this.setProgress(0);
      return;
    }

    const raw = (currentIndex / totalQuestions) * 100;
    const percentage = parseFloat(raw.toFixed(0));
    this.setProgress(percentage);
  } */
  /* setProgressManually(index: number, total: number): void {
    const percentage = Math.round((index / total) * 100);
    this.progressPercentageSubject.next(percentage);
    console.log(`[📊 Manual Progress] Set to ${percentage}%`);
  } */
  public setProgressManually(currentIndex: number, totalQuestions: number): void {
    // Block Q1 progress update
    if (currentIndex === 0) {
      console.warn('[📊 Progress Blocked] Still on Q1, keeping 0%');
      this.progressPercentageSubject.next(0);
      return;
    }
  
    const clampedIndex = Math.min(currentIndex, totalQuestions);
    const percent = Math.floor((clampedIndex / totalQuestions) * 100);
    this.progressPercentageSubject.next(percent);
    console.log(`[✅ Progress Updated] ${percent}%`);
  }

  /* public markQ1Complete(): void {
    this.hasManuallyMarkedQ1Complete = true;
    console.log('[🔓 Progress Unlocked] Q1 marked as complete');
  } */
  /* public markQ1Complete(): void {
    this.hasManuallyMarkedQ1Complete = true;  
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const totalQuestions = this.quizService.getTotalQuestions?.() ?? 1;
  
    if (currentIndex === 0) {
      console.warn('[📊 Progress Suppressed] Still on Q1, forcing 0%');
      this.setProgress(0); // This ensures it stays at 0
      return;
    }
  
    const progressPercent = Math.floor((currentIndex / totalQuestions) * 100);
    console.log(`[✅ Progress Updated] ${progressPercent} %`);
    this.setProgress(progressPercent);
  } */
  /* public markQ1Complete(quizId: string): void {
    this.hasManuallyMarkedQ1Complete = true;

    const currentIndex = this.quizService.getCurrentQuestionIndex();
    const totalQuestions = (this.quizService.getTotalQuestionsCount(quizId) ?? 1) as number;
  
    if (currentIndex === 0) {
      console.warn('[📊 Progress Suppressed] Still on Q1, forcing 0%');
      this.setProgress(0);
      return;
    }
  
    const progressPercent = Math.floor((currentIndex / totalQuestions) * 100);
    console.log(`[✅ Progress Updated] ${progressPercent} %`);
    this.setProgress(progressPercent);
  } */
  markQ1Complete(currentIndex: number): void {
    const quizId = this.quizService.getCurrentQuizId?.();
    const totalRaw = this.quizService.getTotalQuestionsCount?.(quizId);
    const total = typeof totalRaw === 'number' && totalRaw > 0 ? totalRaw : 1;
  
    const clampedIndex = Math.min(currentIndex, total);
    const percent = Math.floor((clampedIndex / total) * 100);
  
    console.log(`[📊 Q1 Complete → Progress: ${percent}%]`, { currentIndex, total });
    this.progressPercentageSubject.next(percent);
  }
 /* markQ1Complete(): void {
    const quizId = this.quizService.getCurrentQuizId?.();
    const totalRaw = this.quizService.getTotalQuestionsCount?.(quizId);
    const total = typeof totalRaw === 'number' && totalRaw > 0 ? totalRaw : 1;
  
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    if (currentIndex <= 1) {
      const percent = Math.floor((1 / total) * 100);
      this.progressPercentageSubject.next(percent);
      console.log(`[📊 Q1 Complete] Progress set to ${percent}%`);
    } else {
      console.warn('[📛 markQ1Complete called too late or from wrong question]');
    }
  }  */
}