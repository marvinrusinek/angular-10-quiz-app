import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizService } from '../../shared/services/quiz.service';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private readonly START_MSG = 'Please start the quiz by selecting an option.';
  private readonly CONTINUE_MSG = 'Please select an option to continue...';
  private readonly NEXT_BTN_MSG = 'Please click the next button to continue.';
  private readonly SHOW_RESULTS_MSG = 'Please click the Show Results button.';

  private selectionMessageSubject = new BehaviorSubject<string>(this.START_MSG);
  public selectionMessage$: Observable<string> = this.selectionMessageSubject.pipe(
    distinctUntilChanged()
  );

  constructor(private quizService: QuizService) {}

  // Getter for the current selection message
  public getCurrentMessage(): string {
    return this.selectionMessageSubject.getValue();  // get the current message value
  }

  // Message determination function
  public determineSelectionMessage(
    questionIndex: number,
    totalQuestions: number,
    isAnswered: boolean
  ): string {
    const isFirst = questionIndex === 0;
    const isLast = questionIndex === totalQuestions - 1;
  
    const msg = !isAnswered
      ? isFirst
        ? this.START_MSG : this.CONTINUE_MSG
      : isLast
        ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
  
    return msg;
  }

  public getRemainingAnswersMessage(options: Option[]): string {
    const correctOptions = options.filter(opt => opt.correct);
    const selectedCorrect = correctOptions.filter(opt => opt.selected).length;
    const remaining = correctOptions.length - selectedCorrect;
  
    if (remaining <= 0) {
      return 'You may now click Next to continue.';
    }
  
    return `Select ${remaining} more correct answer${remaining !== 1 ? 's' : ''} to continue...`;
  }

  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const index = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
  
      if (typeof index !== 'number' || isNaN(index) || total <= 0) {
        console.warn('[❌ setSelectionMessage] Invalid index or totalQuestions');
        return;
      }
  
      const newMessage = this.determineSelectionMessage(index, total, isAnswered);
      const current = this.getCurrentMessage();
  
      if (newMessage !== current) {
        this.updateSelectionMessage(newMessage);
      } else {
        console.log(`[⏸️ Skipping update — message already "${current}"`);
      }
    } catch (error) {
      console.error('[❌ setSelectionMessage ERROR]', error);
    }
  }

  // Method to update the message
  public updateSelectionMessage(message: string): void {
    const current = this.selectionMessageSubject.getValue();
    
    if (!message?.trim()) {
      console.warn('[updateSelectionMessage] Skipped empty or blank message');
      return;
    }
  
    if (message && message.trim() !== '' && current !== message) {
      console.log(`[📢 updateSelectionMessage] New: ${message} | Replacing: ${current}`);
      this.selectionMessageSubject.next(message);
    } else {
      console.log(`[⏸️ updateSelectionMessage] No update needed for: ${message}`);
    }
  }  
}