import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
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

  private getRemainingCorrectCount(options: Option[] | null | undefined): number {
    const opts = Array.isArray(options) ? options : [];
    const correct = opts.filter(o => !!o?.correct);
    const selectedCorrect = correct.filter(o => !!o?.selected).length;
    return Math.max(0, correct.length - selectedCorrect);
  }

  public getRemainingCorrect(options: Option[] | null | undefined, isLastQuestion: boolean): string {
    const remaining = this.getRemainingCorrectCount(options);
    if (remaining > 0) {
      return `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
    }
    return isLastQuestion
      ? 'Please click the Show Results button.'
      : 'Please select the next button to continue...';
  }  

  private pluralize(n: number, singular: string, plural: string): string {
    return n === 1 ? singular : plural;
  }

  public buildMessageOnClick(params: {
    questionIndex: number;  // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];  // current question options with .correct / .selected
  }): string {
    const { questionIndex, totalQuestions, questionType, options } = params;

    const isLast = totalQuestions > 0 && questionIndex === totalQuestions - 1;

    // Multi-answer: until all correct are selected, show the remaining count
    if (questionType === QuestionType.MultipleAnswer) {
      const remaining = this.getRemainingCorrectCount(options);
      if (remaining > 0) {
        return `Select ${remaining} more ${this.pluralize(remaining, 'correct answer', 'correct answers')} to continue...`;
      }
      // remaining === 0 → fall through to Next/Show Results below
    }

    // Single-answer OR multi-answer (all correct selected)
    return isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
  }

  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const index = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
  
      if (typeof index !== 'number' || isNaN(index) || total <= 0) {
        console.warn('[❌ setSelectionMessage] Invalid index or totalQuestions');
        return;
      }
  
      // Try to read the current question + options
      const q: any = (this.quizService as any).currentQuestion
        ?? (this.quizService as any).getQuestion?.(index);
      const options: Option[] = (q?.options ?? []) as Option[];
      const isLast = index === total - 1;
  
      // Derive multi/single by counting correct options
      const correct = options.filter(o => !!o?.correct);
      const selectedCorrect = correct.filter(o => !!o?.selected).length;
      const remaining = Math.max(0, correct.length - selectedCorrect);
      const isMulti = correct.length > 1;
  
      let newMessage: string;
  
      if (isMulti) {
        // Multi-answer: show remaining until all correct are selected
        if (remaining > 0) {
          newMessage = `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
        } else {
          // All correct selected → Next / Show Results
          newMessage = isLast
            ? 'Please click the Show Results button.'
            : 'Please select the next button to continue...';
        }
      } else {
        // Single-answer: use your existing rule
        newMessage = !isAnswered
          ? (index === 0
              ? 'Please start the quiz by selecting an option.'
              : 'Please select an option to continue...')
          : (isLast
              ? 'Please click the Show Results button.'
              : 'Please select the next button to continue...');
      }
  
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