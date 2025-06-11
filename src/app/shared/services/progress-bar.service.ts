import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { QuizService } from './quiz.service'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  // Use BehaviorSubject to store progress value
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  constructor(private quizService: QuizService) {}

  // Method to update the progress
  setProgress(progress: number): void {
    this.progressPercentageSubject.next(progress); // emit the new progress value
  }

  initializeProgressTracking(): void {
    this.setProgress(0); // initialize to 0%
  
    // Subscribe to index changes and update progress
    this.quizService.currentQuestionIndex$.subscribe(index => {
      const totalQuestions = this.quizService.getTotalQuestionsCountSync(); // synchronous getter or store a cached value
      if (totalQuestions > 0) {
        const percentage = Math.round(((index + 1) / totalQuestions) * 100);
        this.progress$.next(percentage);
      }
    });
  }  
}