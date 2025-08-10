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

  public getRemainingCorrect(
    options: Option[] | null | undefined,
    isLastQuestion: boolean
  ): string {
    const opts = Array.isArray(options) ? options : [];
    const correct = opts.filter(o => !!o?.correct);
    const selectedCorrect = correct.filter(o => !!o?.selected).length;
    const remaining = Math.max(0, correct.length - selectedCorrect);
  
    if (remaining > 0) {
      return `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
    }
  
    // All correct selected → flip to Next/Results
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
      const remaining = this.getRemainingCorrect(options, isLast);
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
  
      // Try to read the current question and options without depending on extra imports
      const q: any = (this.quizService as any).currentQuestion ?? (this.quizService as any).getQuestion?.(index);
      const options: Option[] = (q?.options ?? []) as Option[];
  
      // Treat as multi-answer if there are 2+ correct options
      const correct = options.filter(o => !!o?.correct);
      const isMulti = correct.length > 1;
  
      if (isMulti) {
        const selectedCorrect = correct.filter(o => !!o?.selected).length;
        const remaining = Math.max(0, correct.length - selectedCorrect);
  
        // Never overwrite the multi-remaining message while there are still correct answers to pick
        if (remaining > 0) {
          const msg = `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
          const current = this.getCurrentMessage();
          if (msg !== current) this.updateSelectionMessage(msg);
          return; // do NOT fall through to Next/Results
        }
        // remaining === 0 → all correct chosen; proceed to Next/Results below
      }
  
      // Single-answer OR multi-answer with all correct selected → use your existing rule
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