import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, take, takeUntil } from 'rxjs/operators';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService implements OnDestroy {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  constructor(private quizService: QuizService, private router: Router) {}

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
  initializeProgressTracking(quizId: string): void {
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
}