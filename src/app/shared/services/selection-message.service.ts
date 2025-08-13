import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

const START_MSG = 'Please start the quiz by selecting an option.';
const CONTINUE_MSG = 'Please select an option to continue...';
const NEXT_BTN_MSG = 'Please click the next button to continue.';
const SHOW_RESULTS_MSG = 'Please click the Show Results button.';

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(START_MSG);
  public selectionMessage$: Observable<string> = this.selectionMessageSubject.pipe(
    distinctUntilChanged()
  );

  private optionsSnapshotSubject = new BehaviorSubject<Option[]>([]);
  
  private writeSeq = 0;
  public lastSelectionMutation = 0;
  private latestByIndex = new Map<number, number>();
  private freezeNextishUntil = new Map<number, number>();   // block Next-ish until ts
  private suppressPassiveUntil = new Map<number, number>();
  private debugWrites = false;
  private selectionMessageCooldown = false;
  private selectionMessageLock = false;

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
    _isAnswered: boolean
  ): string {
    const opts = this.getLatestOptionsSnapshot();  // current UI list
    const qType =
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type;
  
    return this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType,
      opts
    });
  }

  // Centralized, deterministic message builder
  private computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = Array.isArray(opts) && opts.some(o => !!o?.selected);

    // Before any selection → START/CONTINUE only (no “Next” before a choice)
    if (!anySelected) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }

    // After selection
    if (qType === QuestionType.MultipleAnswer) {
      const correct = opts.filter(o => !!o?.correct);
      const selectedCorrect = correct.filter(o => !!o?.selected).length;
      const remaining = Math.max(0, correct.length - selectedCorrect);

      if (remaining > 0) {
        return `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
      }
      // All correct chosen
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }

    // Single-answer → immediately Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
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
  
      if (!q || !Array.isArray(options) || !options.length) {
        console.warn(`[❌ No valid question/options at Q${index}]`);
        return;
      }
  
      const isLast = index === total - 1;
      const correct = options.filter(o => !!o?.correct);
      const isMulti = correct.length > 1;
      const selectedCorrect = options.filter(o => o.selected && o.correct);
      const remaining = correct.length - selectedCorrect.length;
  
      const currentMsg = this.getCurrentMessage();
  
      // 🛑 BLOCK: If multi-answer and not all correct selected, block Next/Result msg
      if (isMulti) {
        // 🔒 Prevent premature "Next" message if isAnswered=true was passed early
        if (isAnswered && remaining > 0) {
          console.warn(`[⚠️ BLOCKED premature isAnswered=true for Q${index}, remaining=${remaining}]`);
          return;
        }
  
        if (remaining > 0) {
          const msg = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
          if (msg.trim() !== currentMsg?.trim()) {
            this.updateSelectionMessage(msg);
          }
          return;
        }
  
        const finalMsg = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
        if (finalMsg.trim() !== currentMsg?.trim()) {
          this.updateSelectionMessage(finalMsg);
        }
        return;
      }
  
      // SINGLE-ANSWER fallback
      const newMessage = !isAnswered
        ? (index === 0 ? this.START_MSG : this.CONTINUE_MSG)
        : (isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG);
  
      if (newMessage.trim() !== currentMsg?.trim()) {
        this.updateSelectionMessage(newMessage);
      }
  
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  }  
  
  // Method to update the message
  /* public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : ((this.quizService.currentQuestionIndex as number) ?? 0);
  
    const latestToken = this.latestByIndex.get(i0);
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
  
    if (inFreeze && ctx?.token !== latestToken) {
      console.warn(`[⏸️ BLOCKED: freeze window] index=${i0}, token=${ctx?.token}, expected=${latestToken}`);
      return;
    }
  
    const opts: Option[] = Array.isArray(ctx?.options) && ctx!.options!.length
      ? ctx!.options!
      : this.getLatestOptionsSnapshot();
  
    const qType: QuestionType =
      ctx?.questionType ??
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type;
  
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish = low.includes('next button') || low.includes('show results');
  
    // 🔍 Main log for all messages
    console.log(`[🔄 updateSelectionMessage] Q${i0} | current="${current}" | next="${next}" | isMulti=${isMulti}`);
  
    if (!isMulti && isSelectish) {
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const replacement = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
      if (current !== replacement) {
        console.log(`[🚫 BLOCKED: Single-answer should not show “select more…” → replacing with "${replacement}"`);
        this.selectionMessageSubject.next(replacement);
      } else {
        console.log(`[ℹ️ No update needed — already showing "${current}"`);
      }
      return;
    }
  
    if (isMulti) {
      const remaining = this.getRemainingCorrectCount(opts);
      if (remaining > 0 && isNextish) {
        const hold = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
        if (current !== hold) {
          console.log(`[🚫 BLOCKED: Multi-answer not done yet → forcing “${hold}”`);
          this.selectionMessageSubject.next(hold);
        } else {
          console.log(`[ℹ️ Multi-answer holding at: "${current}"`);
        }
        return;
      }
    }
  
    if (current !== next) {
      console.log(`[✅ Message updated → "${next}"`);
      this.selectionMessageSubject.next(next);
    } else {
      console.log(`[⏸️ No change → current message already "${current}"`);
    }
  } */
  public updateSelectionMessage(
    message: string,
    ctx?: {
      options?: Option[];
      index?: number;
      token?: number;
      questionType?: QuestionType;
    }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = typeof ctx?.index === 'number' && Number.isFinite(ctx.index)
      ? ctx!.index as number
      : (this.quizService.currentQuestionIndex ?? 0);
  
    const latestToken = this.latestByIndex.get(i0);
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
    if (inFreeze && ctx?.token !== latestToken) return;
  
    const opts: Option[] = Array.isArray(ctx?.options) && ctx!.options!.length
      ? ctx!.options!
      : this.getLatestOptionsSnapshot();
  
    const qType: QuestionType =
      ctx?.questionType ??
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type;
  
    const isMulti = qType === QuestionType.MultipleAnswer;
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish = low.includes('next button') || low.includes('show results');
  
    // 🛡️ For SINGLE → never allow “Select more” type messages
    if (!isMulti && isSelectish) {
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const replacement = isLast ? this.SHOW_RESULTS_MSG : this.NEXT_BTN_MSG;
      if (current !== replacement) this.selectionMessageSubject.next(replacement);
      return;
    }
  
    // 🛡️ For MULTI → block “Next” messages if not all correct options selected
    if (isMulti) {
      const remaining = this.getRemainingCorrectCount(opts);
      if (remaining > 0 && isNextish) {
        const fallback = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
        if (current !== fallback) this.selectionMessageSubject.next(fallback);
        return;
      }
    }
  
    if (current !== next) {
      this.selectionMessageSubject.next(next);
    }
  }
  

  // Helper: Compute and push atomically (passes options to guard)
  // Deterministic compute from the array passed in
  public updateMessageFromSelection(params: {
    questionIndex: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
    token?: number;
  }): void {
    const { questionIndex, totalQuestions, questionType, options, token } = params;
  
    // Keep snapshot fresh
    this.setOptionsSnapshot(options);
  
    // Compute from the array that the UI actually shows (no reads elsewhere)
    const msg = this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType: questionType,
      opts: options
    });
  
    // Emit (honoring token)
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
  // Writer: always store a cloned array so callers can’t mutate our state
  public setOptionsSnapshot(opts: Option[] | null | undefined): void {
    const safe = Array.isArray(opts) ? opts.map(o => ({ ...o })) : [];
    this.optionsSnapshotSubject.next(safe);
  }

  // Reader: return a defensive copy so external code can’t mutate what we hold
  public getLatestOptionsSnapshot(): Option[] {
    const snap = this.optionsSnapshotSubject.getValue();
    return Array.isArray(snap) ? snap.map(o => ({ ...o })) : [];
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
