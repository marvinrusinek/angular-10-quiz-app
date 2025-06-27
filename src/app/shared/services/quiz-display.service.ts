import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class QuizDisplayService {
  private questionToDisplaySubject = new BehaviorSubject<string | null>(null);
  readonly questionToDisplay$      = this.questionToDisplaySubject.asObservable();

  clearQuestionText(): void {
    this.questionToDisplaySubject.next(null);          // or '' if you prefer
  }

  setQuestionText(raw?: string | null): void {
    const trimmed =
      (raw ?? '')
        .trim() || 'No question available';

    this.questionToDisplaySubject.next(trimmed);
  }
}