import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

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

  private strictMode = true;
  private writeSeq = 0;
  private latestByIndex = new Map<number, number>();
  private activeTokenUntil = new Map<number, number>();     // token is valid until ts
  private freezeNextishUntil = new Map<number, number>();   // block Next-ish until ts
  private suppressPassiveUntil = new Map<number, number>();
  private debugWrites = false; 

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
  
    if (correct.length === 0) return 0;
  
    // Pull authoritative selection for this question (best-effort)
    // selectedOptionsMap may hold a Set of ids OR an array of SelectedOption objects.
    const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(questionIndex);
  
    // Normalize to a Set of stable ids
    const selectedIds: Set<number | string> =
      rawSel instanceof Set
        ? rawSel as Set<number | string>
        : Array.isArray(rawSel)
          ? new Set(
              (rawSel as any[]).map((so, idx: number) =>
                this.getOptionId(so, typeof so === 'object' ? (so.optionId ?? so.value ?? idx) : idx)
              )
            )
          : new Set<number | string>();
  
    // Count selected-correct by set OR by fresh UI flag (UI flag is a fallback)
    let selectedCorrect = 0;
    for (const { o, i } of correct) {
      const id = this.getOptionId(o, i);
      const isSelected = !!o?.selected || selectedIds.has(id);
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
    index: number;               // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): string {
    const { index, totalQuestions, questionType, options } = params;
  
    const isLast   = totalQuestions > 0 && index === totalQuestions - 1;
    const correct  = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
  
    // 🚫 Do NOT infer multi from data. Trust the declared type.
    const isMulti  = questionType === QuestionType.MultipleAnswer;
  
    if (isMulti) {
      const remaining = Math.max(0, correct.length - selected);
      if (remaining > 0) {
        return `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      }
      return isLast
        ? 'Please click the Show Results button.'
        : 'Please click the next button to continue...';
    }
  
    // Single-answer: after any click, show Next/Results
    return isLast
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
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType }
  ): void {
    const next = (message ?? '').trim();
    if (!next) return;
  
    // Strict: require token + options to accept a write
    if (this.strictMode) {
      if (typeof ctx?.token !== 'number' || !Array.isArray(ctx?.options)) {
        console.warn('[SM] drop write (missing token/options)', { next, ctx });
        return;
      }
    }
  
    const i0 = Number.isFinite(ctx?.index) ? (ctx!.index as number)
                                           : this.quizService.currentQuestionIndex ?? 0;
  
    // Token freshness
    const latest = this.latestByIndex.get(i0);
    if (latest != null && ctx!.token! !== latest) {
      console.log('[SM] stale write dropped', { i0, token: ctx!.token, latest });
      return;
    }
  
    // Compute remaining from the PASSED array (authoritative)
    const opts: Option[] = ctx!.options!;
    const qType = ctx?.questionType
      ?? this.quizService.currentQuestion?.getValue()?.type
      ?? this.quizService.currentQuestion.value.type;
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    const correct = opts.filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const remaining = isMulti ? Math.max(0, correct.length - selected) : 0;
  
    const norm = next.toLowerCase();
    const isNextish = norm.includes('next button') || norm.includes('show results');
  
    // Hard guard: if multi still has remaining, force the remaining message always
    if (isMulti && remaining > 0) {
      const hold = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      if (this.selectionMessageSubject.value !== hold) this.selectionMessageSubject.next(hold);
      return;
    }
  
    if (this.selectionMessageSubject.value !== next) this.selectionMessageSubject.next(next);
  }

  // Helper: Compute and push atomically (passes options to guard)
  // Deterministic compute from the array you pass in
  public updateMessageFromSelection(params: {
    questionIndex: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
    token?: number; // optional: service will mint if not provided
  }): void {
    const { questionIndex, totalQuestions, questionType, options } = params;

    this.setOptionsSnapshot(options);

    const token = params.token ?? this.beginWrite(questionIndex, 600);

    const isLast   = totalQuestions > 0 && questionIndex === totalQuestions - 1;
    const correct  = options.filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti  = questionType === QuestionType.MultipleAnswer;
    const remaining = Math.max(0, correct.length - selected);

    const msg = isMulti
      ? (remaining > 0
          ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
          : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG))
      : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);

    this.updateSelectionMessage(msg, {
      options: options,
      index: questionIndex,
      token,
      questionType,
    });
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
    const svc: any = this.quizService as any;
  
    // Prefer a concrete questions array if available
    const all = Array.isArray(svc.questions) ? (svc.questions as any[]) : [];
  
    // Try by index, else fall back to currentQuestion
    const q = (idx >= 0 && idx < all.length ? all[idx] : undefined) ??
      svc.currentQuestion ??
      null;
  
    return Array.isArray(q?.options) ? (q.options as Option[]) : [];
  }

  private pickOptionsForGuard(passed?: Option[], idx?: number): Option[] {
    if (Array.isArray(passed) && passed.length) return passed;
  
    const snap = this.getLatestOptionsSnapshot();
    if (snap.length) return snap;
  
    const i0 = (typeof idx === 'number' && !Number.isNaN(idx)) ? idx
      : (this.quizService.currentQuestionIndex as number) ?? 0;
  
    return this.getCurrentOptionsByIndex(i0);
  }

  // Reserve a write slot for this question; returns the token to attach to the write.
  public beginWrite(index: number, freezeMs = 600): number {
    const token = ++this.writeSeq;
    this.latestByIndex.set(index, token);
    this.freezeNextishUntil.set(index, performance.now() + freezeMs);
    return token;
  }

  /** End a guarded write for this index.
   *  - If `token` is stale (not the latest), we do nothing.
   *  - If it’s the latest, we immediately end the “freeze window”
   *    so legit Next/Results can show (once remaining === 0).
   */
   public endWrite(index: number, token?: number, opts?: { clearTokenWindow?: boolean }): void {
    if (typeof token === 'number') {
      const latest = this.latestByIndex.get(index);
      if (latest != null && token !== latest) return; // stale; ignore
    }
    if (opts?.clearTokenWindow) this.freezeNextishUntil.delete(index);
  }

  private inFreezeWindow(index: number): boolean {
    const until = this.freezeNextishUntil.get(index) ?? 0;
    return performance.now() < until;
  }

  // Authoritative: call ONLY from the option click with the UPDATED array
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Reserve a write token + freeze "Next-ish" overwrites for 300ms
    const token = this.beginWrite(index, 300);
  
    // ALSO: suppress any passive emits for ~120ms after this click
    this.suppressPassiveUntil.set(index, performance.now() + 120);
  
    // Compute deterministic message from the UPDATED array
    const isLast   = totalQuestions > 0 && index === totalQuestions - 1;
    const correct  = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti  = questionType === QuestionType.MultipleAnswer;
    const remaining = Math.max(0, correct.length - selected);
  
    let msg: string;
    if (isMulti) {
      msg = remaining > 0
        ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
        : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);
    } else {
      msg = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
    }
  
    if (this.debugWrites) console.log('[emitFromClick]', { index, remaining, msg, token });
  
    this.updateSelectionMessage(msg, {
      options,
      index,
      token,
      questionType
    });
  }

  // Passive: call from navigation/reset/timer-expiry/etc.
  // This auto-skips during a freeze (so it won’t fight the click).
  public emitPassive(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // If a click just happened, ignore this passive write for a tiny window
    const until = this.suppressPassiveUntil.get(index) ?? 0;
    if (performance.now() < until) {
      if (this.debugWrites) console.log('[emitPassive] suppressed by click window', { index });
      return;
    }
  
    // Compute deterministic message from the PASSED array (no service reads)
    const isLast   = totalQuestions > 0 && index === totalQuestions - 1;
    const correct  = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti  = questionType === QuestionType.MultipleAnswer;
    const remaining = Math.max(0, correct.length - selected);
  
    let msg: string;
    if (isMulti) {
      msg = remaining > 0
        ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
        : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);
    } else {
      msg = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
    }
  
    // Passive writes get a token as well (0ms freeze by default)
    const token = this.beginWrite(index, 0);
  
    if (this.debugWrites) console.log('[emitPassive]', { index, remaining, msg, token });
  
    this.updateSelectionMessage(msg, {
      options,
      index,
      token,
      questionType
    });
  }
}