import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class QuizDisplayService {
  private questionToDisplaySubject = new BehaviorSubject<string | null>(null);
  readonly questionToDisplay$      = this.questionToDisplaySubject.asObservable();

  // Clear UI instantly so the old question never flashes
  private clearQuestionText(): void {
    this.questionToDisplaySubject.next(null);  // pushes a blank so UI empties instantly
  }

  // Push the trimmed final text or a fallback
  private setQuestionText(raw: string | null | undefined): void {
    const trimmed =
      (raw ?? '')
        .trim() || 'No question available';

    this.questionToDisplaySubject.next(trimmed);
    this.questionToDisplay = trimmed;
  }
}