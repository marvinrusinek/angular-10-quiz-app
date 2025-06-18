import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  private hasMarkedQ1Complete = false;

  constructor(
    private quizService: QuizService
  ) {}

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