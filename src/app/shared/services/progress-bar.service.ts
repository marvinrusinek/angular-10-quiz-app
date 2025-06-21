import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs'; 

@Injectable({ providedIn: 'root' })
export class ProgressBarService {
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  progress$ = this.progressPercentageSubject.asObservable();

  private hasMarkedQ1Complete = false;

  // Method to update the progress
  updateProgress(currentIndex: number, totalQuestions: number): void {
    // If totalQuestions is not valid, default to 0%
    if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
      console.warn('[⚠️ Invalid totalQuestions] Setting progress to 0%.');
      this.progressPercentageSubject.next(0);
      return;
    }
  
    // Prevent progress update if still on Q1 and not marked complete
    const isQ1 = currentIndex === 0;
    if (isQ1 && !this.hasMarkedQ1Complete) {
      console.warn('[🛑 Progress Blocked] Still on Q1 and not marked complete.');
      return;
    }
  
    // Clamp index between 0 and totalQuestions
    const clampedIndex = Math.min(Math.max(currentIndex, 0), totalQuestions);
  
    // Calculate and emit progress
    const percentage = totalQuestions > 0 ? (clampedIndex / totalQuestions) * 100 : 0;
    this.progressPercentageSubject.next(percentage);
  }  
}