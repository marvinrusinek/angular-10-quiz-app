import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class QuizDisplayService {
  private questionToDisplaySubject = new BehaviorSubject<string | null>(null);
  readonly questionToDisplay$ = this.questionToDisplaySubject.asObservable();

  // Clear UI instantly so the old question never flashes
  public clearQuestionText(): void {
    console.log('[HDG] clear');
    this.questionToDisplaySubject.next(null);  // pushes a blank so UI empties instantly
  }

  // Push the trimmed final text or a fallback
  setQuestionText(text: string | null | undefined): void {
    const trimmed = (text ?? '').trim();

    if (!trimmed) {
      console.warn(
        '[⚠️ setQuestionText] Empty or invalid question text received:',
        text
      );
      this.questionToDisplaySubject.next('No question available');
    } else {
      console.log('[HDG] set:', trimmed);
      this.questionToDisplaySubject.next(trimmed);
    }
  }
}