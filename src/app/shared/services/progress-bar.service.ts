import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  constructor(private quizService: QuizService) {}

  private destroy$ = new Subject<void>();

  // Method to update the progress
  setProgress(progress: number): void {
    this.progressPercentageSubject.next(progress); // emit the new progress value
  }

  initializeProgressTracking(quizId: string): void {
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
          const raw = (index / totalQuestions) * 100;
          const percentage = parseFloat(raw.toFixed(0));
          this.setProgress(percentage);
        } else {
          this.setProgress(0);
        }
      });
  }  
}