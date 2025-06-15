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
  setProgress(progress: number): void {
    this.progressPercentageSubject.next(progress); // emit the new progress value
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
  initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // Always start at 0%
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ])
      .pipe(
        debounceTime(50),
        takeUntil(this.destroy$)
      )
      .subscribe(([totalQuestions, index]) => {
        console.log('[🧭 ProgressBar DEBUG]', {
          totalQuestions,
          index,
          hasNavigatedPastQ1: this.hasNavigatedPastQ1
        });
      
        const suppress = index === 0 && !this.hasNavigatedPastQ1;
        if (suppress) {
          console.warn('[⛔ Suppress Progress] Still on Q1 — setting 0%');
          this.setProgress(0);
          return;
        }
      
        const raw = (index / totalQuestions) * 100;
        const percentage = parseFloat(raw.toFixed(0));
        console.log('[✅ Progress Updated]', percentage, '%');
        this.setProgress(percentage);
      });
  }
  

  // Manually update progress percentage (0–100) based on current index
  setProgressManually(currentIndex: number): void {
    const quiz = this.quizService.getActiveQuiz();
    const totalQuestions = quiz?.questions?.length ?? 0;

    if (totalQuestions <= 0) {
      this.setProgress(0);
      return;
    }

    const raw = (currentIndex / totalQuestions) * 100;
    const percentage = parseFloat(raw.toFixed(0));
    this.setProgress(percentage);
  }

  public markQ1Complete(): void {
    this.hasNavigatedPastQ1 = true;
  }
}