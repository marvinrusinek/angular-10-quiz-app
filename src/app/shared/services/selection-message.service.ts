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
  
      const isLast = index === total - 1;
  
      // First: enforce multi-remaining if applicable
      const { isMulti, remaining } = this.hasMultiRemaining();
      if (isMulti && remaining > 0) {
        const msg = `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
        if (msg !== this.getCurrentMessage()) this.updateSelectionMessage(msg);
        return; // do NOT fall through
      }
  
      // Single-answer OR multi with all correct selected → your existing rule
      const newMessage = this.determineSelectionMessage(index, total, isAnswered);
      if (newMessage !== this.getCurrentMessage()) {
        this.updateSelectionMessage(newMessage);
      } else {
        console.log(`[⏸️ Skipping update — message already "${newMessage}"`);
      }
    } catch (error) {
      console.error('[❌ setSelectionMessage ERROR]', error);
    }
  }

  // Method to update the message
  public updateSelectionMessage(message: string): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();

    if (!next) {
      console.warn('[updateSelectionMessage] Skipped empty or blank message');
      return;
    }

    // Guard: don't let "Next/Results" overwrite multi-remaining
    const { isMulti, remaining } = this.hasMultiRemaining();
    const isNextish =
      next === this.NEXT_BTN_MSG || next === this.SHOW_RESULTS_MSG;

    if (isMulti && remaining > 0 && isNextish) {
      const hold = `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
      if (current !== hold) {
        this.selectionMessageSubject.next(hold);
      }
      return;  // block overwrite
    }

    if (current !== next) {
      console.log(`[📢 updateSelectionMessage] New: ${next} | Replacing: ${current}`);
      this.selectionMessageSubject.next(next);
    } else {
      console.log(`[⏸️ updateSelectionMessage] No update needed for: ${next}`);
    }
  }

  // Get current question's options safely from QuizService
  private getCurrentOptions(): Option[] {
    const idx = this.quizService.currentQuestionIndex as number;
    const q: any = (this.quizService as any).currentQuestion
      ?? (this.quizService as any).getQuestion?.(idx);
    return (q?.options ?? []) as Option[];
  }

  // Is current question multi and how many correct remain?
  private hasMultiRemaining(): { isMulti: boolean; remaining: number } {
    const options = this.getCurrentOptions();
    const correct = options.filter(o => !!o?.correct);
    const isMulti = correct.length > 1;
    const remaining = isMulti ? this.getRemainingCorrectCount(options) : 0;
    return { isMulti, remaining };
  }
}