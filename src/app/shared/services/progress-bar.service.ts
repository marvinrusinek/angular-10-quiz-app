import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest } from 'rxjs';

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

  initializeProgressTracking(quizId: string): void {
    this.setProgress(0); // always start at 0%
  
    combineLatest([
      this.quizService.getTotalQuestionsCount(quizId),
      this.quizService.currentQuestionIndex$
    ]).subscribe(([totalQuestions, index]) => {
      if (totalQuestions > 0) {
        const raw = (index / totalQuestions) * 100;
        const percentage = parseFloat(raw.toFixed(0)); // round properly
        this.setProgress(percentage);
      } else {
        this.setProgress(0);
      }
    });
  }  
}