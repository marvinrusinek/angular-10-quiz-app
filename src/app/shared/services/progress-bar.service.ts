import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, take, takeUntil, takeUntilDestroyed } from 'rxjs/operators';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService implements OnDestroy {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  constructor(
    private quizService: QuizService
  ) {}

  private destroy$ = new Subject<void>();
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Method to update the progress
  setProgress(progress: number): void {
    const isQ1 = this.quizService.getCurrentQuestionIndex?.() === 0;
    if (isQ1 && !this.hasMarkedQ1Complete) {
      console.warn('[🛑 Progress Blocked inside setProgress()] Still on Q1');
      return;
    }
  
    this.progressPercentageSubject.next(progress);
  }

  updateProgress(currentIndex: number, totalQuestions: number): void {
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      this.progressPercentageSubject.next(0);
      return;
    }
  
    // Clamp to prevent values beyond totalQuestions
    const clampedIndex = Math.min(Math.max(currentIndex, 0), totalQuestions);
    const percent = Math.round((clampedIndex / totalQuestions) * 100);
  
    this.progressPercentageSubject.next(percent);
  }
}