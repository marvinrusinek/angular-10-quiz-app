import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, firstValueFrom } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

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

  private optionsSnapshotSubject = new BehaviorSubject<Option[]>([]);
  private lastSelectionMutation = 0;

  constructor(
    private quizService: QuizService, 
    private selectedOptionService: SelectedOptionService
  ) {}

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

  public getRemainingCorrectCountByIndex(
    questionIndex: number,
    options?: Option[]
  ): number {
    // Always compute from the freshest array for this index
    const opts = this.pickOptionsForGuard(options, questionIndex);
    if (!Array.isArray(opts) || opts.length === 0) return 0;
  
    // Correct options for this question
    const correct = opts
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !!o?.correct);
  
    // Pull authoritative selection for this question (best-effort)
    const selSet: any = this.selectedOptionService?.selectedOptionsMap.get(questionIndex);
  
    let selectedCorrect = 0;
    for (const { o, i } of correct) {
      const id = this.getOptionId(o, i);
      const isSelected = !!o?.selected || !!selSet?.has?.(id);
      if (isSelected) selectedCorrect++;
    }
  
    return Math.max(0, correct.length - selectedCorrect);
  }

  public getRemainingCorrectCount(options: Option[] | null | undefined): number {
    const opts = Array.isArray(options) ? options : [];
    const correct = opts.filter(o => !!o?.correct);
    const selectedCorrect = correct.filter(o => !!o?.selected).length;
    return Math.max(0, correct.length - selectedCorrect);
  }

  // String helper: ONLY for MULTI; SINGLE will never call this
  public getRemainingCorrect(
    options: Option[] | null | undefined,
    isLastQuestion: boolean
  ): string {
    const remaining = this.getRemainingCorrectCount(options);
    if (remaining > 0) {
      return `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
    }
    return isLastQuestion
      ? 'Please click the Show Results button.'
      : 'Please select the next button to continue...';
  }

  private pluralize(n: number, singular: string, plural: string): string {
    return n === 1 ? singular : plural;
  }

  // Build message on click (correct wording + logic)
  public buildMessageFromSelection(params: {
    questionIndex: number;           // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];               // the updated array (post-click)
  }): string {
    const { questionIndex, totalQuestions, questionType, options } = params;
    const last = this.isLast(questionIndex, totalQuestions);
  
    if (questionType === QuestionType.MultipleAnswer) {
      const remaining = this.getRemainingCorrectCount(options);
      if (remaining > 0) {
        return `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      }
      return last
        ? 'Please click the Show Results button.'
        : 'Please click the next button to continue...';
    }
    
    // Single-answer: always Next/Results after a click
    return last
      ? 'Please click the Show Results button.'
      : 'Please click the next button to continue...';
  }

  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const index = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
  
      if (typeof index !== 'number' || isNaN(index) || total <= 0) {
        console.warn('[❌ setSelectionMessage] Invalid index or totalQuestions');
        return;
      }
  
      const svc: any = this.quizService as any;
      const q: QuizQuestion = svc.currentQuestion ?? (Array.isArray(svc.questions) ? svc.questions[index] : undefined);
      const options: Option[] = (q?.options ?? []) as Option[];
      const isLast = index === total - 1;
  
      // MULTI: show remaining until done
      const correct = options.filter(o => !!o?.correct);
      const isMulti = correct.length > 1;
      if (isMulti) {
        const remaining = this.getRemainingCorrectCount(options);
        const msg = (remaining > 0)
          ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
          : (isLast
              ? 'Please click the Show Results button.'
              : 'Please select the next button to continue...');
        if (msg !== this.getCurrentMessage()) this.updateSelectionMessage(msg);
        return;
      }

      // SINGLE: never show “Select …” → Next/Results if answered, else start/continue
      const newMessage = !isAnswered
        ? (index === 0
            ? 'Please start the quiz by selecting an option.'
            : 'Please select an option to continue...')
        : (isLast
            ? 'Please click the Show Results button.'
            : 'Please select the next button to continue...');

      if (newMessage !== this.getCurrentMessage()) {
        this.updateSelectionMessage(newMessage);
      }
    } catch (error) {
      console.error('[❌ setSelectionMessage ERROR]', error);
    }
  }

  // Method to update the message
  public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) {
      console.warn('[updateSelectionMessage] Skipped empty or blank message');
      return;
    }
  
    // Case-insensitive “next/results”
    const norm = next.toLowerCase();
    const isNextish = norm.includes('next button') || norm.includes('show results');
  
    // Get fresh options for the correct index
    const i0 = (typeof ctx?.index === 'number' && !Number.isNaN(ctx.index))
      ? ctx!.index!
      : (this.quizService.currentQuestionIndex as number) ?? 0;
  
    const opts = this.pickOptionsForGuard(ctx?.options, i0);
  
    const correct = opts.filter(o => !!o?.correct);
    const isMulti = correct.length > 1;
  
    // Authoritative remaining (SelectedOptionService-aware)
    const remaining = isMulti ? this.getRemainingCorrectCountByIndex(i0, opts) : 0;
  
    const justMutated = (performance.now() - this.lastSelectionMutation) < 120;
  
    // Block “Next/Results” while multi still has remaining or right after a mutation
    if (isMulti && (remaining > 0 || justMutated) && isNextish) {
      const hold = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      if (current !== hold) this.selectionMessageSubject.next(hold);
      return;
    }
  
    if (current !== next) {
      this.selectionMessageSubject.next(next);
    }
  }
  

  // Helper: Compute and push atomically (passes options to guard)
  public updateMessageFromSelection(params: {
    questionIndex: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): void {
    // Keep snapshot fresh for any other callers
    this.setOptionsSnapshot(params.options);

    const msg = this.buildMessageFromSelection(params);
    this.updateSelectionMessage(msg, { options: params.options });
  }

  // Is current question multi and how many correct remain?
  private hasMultiRemaining(ctx?: { options?: Option[]; index?: number })
  : { isMulti: boolean; remaining: number } {
    const i0 = (typeof ctx?.index === 'number' && !Number.isNaN(ctx.index))
      ? ctx!.index!
      : Number(this.quizService.currentQuestionIndex) ?? 0;

    const options = this.pickOptionsForGuard(ctx?.options, i0);
    const correct = options.filter(o => !!o?.correct);
    const isMulti = correct.length > 1;

    // Use the authoritative counter that consults SelectedOptionService
    const remaining = isMulti ? this.getRemainingCorrectCountByIndex(i0, options) : 0;

    return { isMulti, remaining };
  }

  // Snapshot API
  public setOptionsSnapshot(options: Option[] | null | undefined): void {
    const opts = Array.isArray(options) ? options : [];
    this.optionsSnapshotSubject.next(opts);
  }
  
  private getLatestOptionsSnapshot(): Option[] {
    return this.optionsSnapshotSubject.getValue() ?? [];
  }

  public notifySelectionMutated(options: Option[] | null | undefined): void {
    this.setOptionsSnapshot(options);                // keep existing snapshot
    this.lastSelectionMutation = performance.now();  // start small hold-off window
  }

  // Helpers
  private isLast(idx: number, total: number): boolean {
    return total > 0 && idx === total - 1;
  }

  private getOptionId(opt: Option, idx: number): number | string {
    // Prefer stable IDs; fall back safely to the loop index
    return (opt?.optionId ?? idx);
  }

  // Get current question's options safely from QuizService
  private getCurrentOptionsByIndex(idx: number): Option[] {
    const q = firstValueFrom(this.quizService.getQuestionByIndex(idx))
      ?? this.quizService.currentQuestion;
    return (q?.options ?? []) as Option[];
  }

  private pickOptionsForGuard(passed?: Option[], idx?: number): Option[] {
    if (Array.isArray(passed) && passed.length) return passed;
  
    const snap = this.getLatestOptionsSnapshot();
    if (snap.length) return snap;
  
    const i0 = (typeof idx === 'number' && !Number.isNaN(idx))
      ? idx
      : (this.quizService.currentQuestionIndex as number) ?? 0;
  
    return this.getCurrentOptionsByIndex(i0);
  }
}