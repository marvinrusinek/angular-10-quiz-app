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

  private writeSeq = 0;
  private latestByIndex = new Map<number, number>();
  private activeTokenUntil = new Map<number, number>();     // token is valid until ts
  private freezeNextishUntil = new Map<number, number>();   // block Next-ish until ts

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
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : ((this.quizService.currentQuestionIndex as number) ?? 0);
  
    // Token check (authoritative click writer)
    if (typeof ctx?.token === 'number') {
      const latest = this.latestByIndex.get(i0);
      if (latest != null && ctx.token !== latest) return; // stale write
    } else {
      // Passive writers: do nothing during freeze
      if (this.inFreezeWindow(i0)) return;
    }
  
    const opts: Option[] = Array.isArray(ctx?.options) ? ctx!.options! : [];
    const qType =
      ctx?.questionType ??
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type;
  
    const isMulti = qType === QuestionType.MultipleAnswer;
    const norm = next.toLowerCase();
    const isNextish = norm.includes('next button') || norm.includes('show results');
  
    // Authoritative remaining computed from PASSED array (no re-derives)
    const remaining = isMulti ? this.getRemainingCorrectCount(opts) : 0;
  
    // Never let "Next/Results" overwrite a valid remaining message
    if (isMulti && remaining > 0 && isNextish) {
      const hold = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      if (current !== hold) this.selectionMessageSubject.next(hold);
      return;
    }
  
    if (current !== next) this.selectionMessageSubject.next(next);
  }

  // Helper: Compute and push atomically (passes options to guard)
  public updateMessageFromSelection(params: {
    questionIndex: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
    token: number;
  }): void {
    const { questionIndex, totalQuestions, questionType, options, token } = params;
  
    // Snapshot for anyone else (ok)
    this.setOptionsSnapshot(options);
  
    // Compute from PASSED array only
    const isLast   = totalQuestions > 0 && questionIndex === totalQuestions - 1;
    const correct  = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti  = questionType === QuestionType.MultipleAnswer;
  
    let msg: string;
    if (isMulti) {
      const remaining = Math.max(0, correct.length - selected);
      msg = (remaining > 0)
        ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
        : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);
    } else {
      msg = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
    }
  
    // Forward exactly what we computed from + the token
    this.updateSelectionMessage(msg, {
      options,
      index: questionIndex,
      token,
      questionType
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
  public beginWrite(index: number, freezeMs = 350): number {
    const token = ++this.writeSeq;
    this.latestByIndex.set(index, token);
    if (freezeMs > 0) {
      this.freezeNextishUntil.set(index, performance.now() + freezeMs);
    }
    return token;
  }

  /** End a guarded write for this index.
   *  - If `token` is stale (not the latest), we do nothing.
   *  - If it’s the latest, we immediately end the “freeze window”
   *    so legit Next/Results can show (once remaining === 0).
   */
   public endWrite(index: number, token?: number): void {
    if (typeof token === 'number') {
      const latest = this.latestByIndex.get(index);
      if (latest != null && token !== latest) return; // stale
    }
    this.freezeNextishUntil.delete(index); // end freeze now
  }

  private inFreezeWindow(index: number): boolean {
    const until = this.freezeNextishUntil.get(index) ?? 0;
    return performance.now() < until;
  }

  // Authoritative: call ONLY from the option click with the UPDATED array
  public emitFromClick(ctx: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];    // include the clicked state applied
  }): void {
    const { index, totalQuestions, questionType, options } = ctx;

    const token = this.beginWrite(index, 350); // start freeze tied to this click

    // Build message deterministically from passed array
    const isLast = totalQuestions > 0 && index === totalQuestions - 1;
    const correct = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti = questionType === QuestionType.MultipleAnswer;

    let msg: string;
    if (isMulti) {
      const remaining = Math.max(0, correct.length - selected);
      msg = (remaining > 0)
        ? `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`
        : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);
    } else {
      msg = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
    }

    this.updateSelectionMessage(msg, {
      options,
      index,
      token,
      questionType
    });

    // Optional: end freeze a bit later to allow other async UI to settle
    setTimeout(() => this.endWrite(index, token), 220);
  }

  // Passive: call from navigation/reset/timer-expiry/etc.
  // This auto-skips during a freeze (so it won’t fight the click).
  public emitPassive(ctx: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): void {
    if (this.inFreezeWindow(ctx.index)) return;

    const isLast = ctx.totalQuestions > 0 && ctx.index === ctx.totalQuestions - 1;
    const correct = (ctx.options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti = ctx.questionType === QuestionType.MultipleAnswer;

    const msg = isMulti
      ? (Math.max(0, correct.length - selected) > 0
          ? `Select ${Math.max(0, correct.length - selected)} more correct option${Math.max(0, correct.length - selected) === 1 ? '' : 's'} to continue...`
          : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG))
      : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);

    this.updateSelectionMessage(msg, {
      options: ctx.options,
      index: ctx.index,
      questionType: ctx.questionType
    });
  }
}