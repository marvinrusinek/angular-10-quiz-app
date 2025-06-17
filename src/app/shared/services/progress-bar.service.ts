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
}