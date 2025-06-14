import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService implements OnDestroy {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  constructor(private quizService: QuizService) {}

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
    this.setProgress(0); // always start at 0%
  
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
        if (totalQuestions <= 0) {
          this.setProgress(0);
          return;
        }
  
        // 🔐 Extra guard: suppress progress if on Q1
        if (index === 0) {
          console.warn('[📊 Progress Suppressed] Still on Q1, forcing 0%');
          this.setProgress(0);
          return;
        }
  
        // ✅ Update progress normally
        const percentage = parseFloat(((index / totalQuestions) * 100).toFixed(0));
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
}