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
const buildRemainingMsg = (remaining: number) =>
  `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;

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
    // Use the latest UI snapshot ONLY to know what's selected…
    const uiSnapshot = this.getLatestOptionsSnapshot();
  
    // …but compute correctness from CANONICAL question options (authoritative).
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (questionIndex >= 0 && questionIndex < qArr.length ? qArr[questionIndex] : undefined)
              ?? svc.currentQuestion ?? null;
  
    const qType: QuestionType = q?.type ?? (
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type
    );
  
    // Build a set of selected IDs from the UI snapshot
    const selectedIds = new Set<number | string>();
    for (let i = 0; i < uiSnapshot.length; i++) {
      const o = uiSnapshot[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }

    // Overlay selection into canonical options (which have reliable `correct`)
    const canonical = Array.isArray(q?.options) ? q!.options : [];
    const overlaid: Option[] = canonical.length
      ? canonical.map((o, i) => {
          const id = (o as any)?.optionId ?? i;
          return { ...o, selected: selectedIds.has(id) };
        })
      : uiSnapshot.map(o => ({ ...o })); // fallback if canonical absent
  
    return this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType,
      opts: overlaid
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
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    // Selected/correct from authoritative, overlaid opts
    const anySelected = opts.some(o => !!o?.selected);
    const totalCorrect = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
    // Nothing picked yet
    if (!anySelected) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    if (isMulti) {
      if (remaining > 0) {
        // Use "answer/answers" wording as requested
        return `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;
      }
      // All correct selected → Next/Results
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Single-answer → immediately Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  }  

  public getRemainingCorrectCountByIndex(
    questionIndex: number,
    options?: Option[]
  ): number {
    // If caller passed UPDATED options, trust them first (authoritative)
    if (Array.isArray(options) && options.length) {
      const correct = options.filter(o => !!o?.correct);
      if (correct.length === 0) return 0;
      const selectedCorrect = correct.filter(o => !!o?.selected).length;
      return Math.max(0, correct.length - selectedCorrect);
    }
  
    // Else fall back to freshest snapshot
    const opts = this.pickOptionsForGuard(undefined, questionIndex);
    if (!Array.isArray(opts) || opts.length === 0) return 0;
  
    // Count using SelectedOptionService map (best effort)
    const correct = opts.map((o, i) => ({ o, i })).filter(({ o }) => !!o?.correct);
    if (correct.length === 0) return 0;
  
    const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(questionIndex);
    const selectedIds: Set<number | string> =
      rawSel instanceof Set
        ? rawSel
        : Array.isArray(rawSel)
          ? new Set((rawSel as any[]).map((so, idx: number) =>
              this.getOptionId(so, typeof so === 'object' ? (so.optionId ?? so.value ?? idx) : idx)
            ))
          : new Set();
  
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
    return isLastQuestion ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
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
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Single-answer: after any click, show Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
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
      const isMulti = (q?.type === QuestionType.MultipleAnswer);
      const selectedCorrect = options.filter(o => o.selected && o.correct);
      const remaining = correct.length - selectedCorrect.length;
  
      const currentMsg = this.getCurrentMessage();
  
      // BLOCK: If multi-answer and not all correct selected, block Next/Result msg
      if (isMulti) {
        // Prevent premature "Next" message if isAnswered=true was passed early
        if (isAnswered && remaining > 0) {
          console.warn(`[⚠️ BLOCKED premature isAnswered=true for Q${index}, remaining=${remaining}]`);
          return;
        }
  
        if (remaining > 0) {
          const msg = `Select ${remaining} more correct option${remaining === 1 ? '' : 's'} to continue...`;
          if (msg !== currentMsg) {
            this.updateSelectionMessage(msg);
          }
          return;
        }
  
        // All correct selected
        const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  
        if (finalMsg !== currentMsg) {
          this.updateSelectionMessage(finalMsg);
        }
        return;
      }
  
      // SINGLE-ANSWER fallback
      const newMessage = !isAnswered
        ? (index === 0 ? START_MSG : CONTINUE_MSG)
        : (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG);
  
      if (newMessage !== currentMsg) {
        this.updateSelectionMessage(newMessage);
      }
  
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  }
  
  // Method to update the message  
  public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    const qType: QuestionType = ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
  
    // Use authoritative UPDATED options if provided; else snapshot
    const opts: Option[] =
      (Array.isArray(ctx?.options) && ctx!.options!.length)
        ? ctx!.options!
        : this.getLatestOptionsSnapshot();
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // 🔒 During the suppression window, block any Next-ish writes outright.
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (performance.now() < passiveHold && isNextish) {
      return; // ignore attempts to flip to Next during hold
    }
  
    // If we set an explicit Next-ish freeze, also block Next-ish until the time passes.
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (performance.now() < nextFreeze && isNextish) {
      return;
    }
  
    // MULTI → compute remaining from authoritative options and short-circuit
    if (qType === QuestionType.MultipleAnswer) {
      const remaining = this.getRemainingCorrectCountByIndex(i0, opts);
  
      // Still missing correct picks → FORCE "Select N more..." and return
      if (remaining > 0) {
        const forced = buildRemainingMsg(remaining);
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
  
      // All correct selected → allow Next/Results immediately
      if (isNextish) {
        if (current !== next) this.selectionMessageSubject.next(next);
        return;
      }
  
      // If not Next-ish, emit the correct final msg now
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    if (qType !== QuestionType.MultipleAnswer) {
      const anySelected = (opts ?? []).some(o => !!o?.selected);
      const isLast = i0 === (this.quizService.totalQuestions - 1);
  
      if (isSelectish) {
        const replacement = anySelected ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                                        : (i0 === 0 ? START_MSG : CONTINUE_MSG);
        if (current !== replacement) this.selectionMessageSubject.next(replacement);
        return;
      }
  
      if (isNextish && anySelected) {
        if (current !== next) this.selectionMessageSubject.next(next);
        return;
      }
      // fall through to stale-writer guard
    }
  
    // Stale writer guard (only for ambiguous cases)
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
    const latestToken = this.latestByIndex.get(i0);
    if (inFreeze && ctx?.token !== latestToken) return;
  
    if (current !== next) this.selectionMessageSubject.next(next);
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
  
    // If a token is present and we’re still in the frozen window, skip message update
    if (typeof token === 'number' && this.isWriteFrozen(questionIndex, token)) {
      console.warn(`[❄️ Frozen] Skipping message update for Q${questionIndex} (token ${token})`);
      return;
    }
  
    // Keep snapshot fresh (used for diff/debug if needed)
    this.setOptionsSnapshot(options);
  
    // Compute message from clean local state only
    const msg = this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType: questionType,
      opts: options
    });
  
    // Emit message with context for downstream use
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

    const qType = this.getQuestionTypeForIndex(i0);
    const isMulti = qType === QuestionType.MultipleAnswer;

    if (!isMulti) return { isMulti: false, remaining: 0 };

    const options = this.pickOptionsForGuard(ctx?.options, i0);
    const remaining = this.getRemainingCorrectCountByIndex(i0, options);
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

  // HELPERS
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
      svc.currentQuestion ?? null;
  
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

  public isWriteFrozen(index: number, token: number): boolean {
    const latest = this.latestByIndex.get(index);
    const stillFrozen = this.inFreezeWindow(index);
  
    // Only frozen if:
    // - The token matches the latest one
    // - We're still inside the freeze window
    return token === latest && stillFrozen;
  }

  // Authoritative: call ONLY from the option click with the UPDATED array
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];  // UPDATED canonical: has correct + selected overlay
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Snapshot authoritative options first
    this.setOptionsSnapshot(options);
  
    // Declared type only
    const qType = questionType ?? this.getQuestionTypeForIndex(index);
    const isLast = totalQuestions > 0 && index === totalQuestions - 1;
  
    // Compute remaining from UPDATED canonical options
    const correct = (options ?? []).filter(o => !!o?.correct);
    const selectedCorrect = correct.filter(o => !!o?.selected).length;
    const remaining = Math.max(0, correct.length - selectedCorrect);
  
    // 🔥 Click is decisive. If multi & remaining>0 → force "Select N more..." and stop.
    if (qType === QuestionType.MultipleAnswer) {
      if (remaining > 0) {
        const msg = buildRemainingMsg(remaining);
        const current = this.selectionMessageSubject.getValue();
        if (current !== msg) this.selectionMessageSubject.next(msg);
  
        // Block any passive/Next-ish writers for a short window
        const hold = performance.now() + 600; // was 150–180; bump to kill flash
        this.suppressPassiveUntil.set(index, hold);
        this.freezeNextishUntil.set(index, hold); // extra guard: block next-ish during hold
        return;
      }
  
      // remaining === 0 → legit Next/Results immediately
      const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      const current = this.selectionMessageSubject.getValue();
      if (current !== msg) this.selectionMessageSubject.next(msg);
  
      const hold = performance.now() + 300;
      this.suppressPassiveUntil.set(index, hold);
      this.freezeNextishUntil.set(index, hold);
      return;
    }
  
    // Single-answer: always Next/Results after any pick
    const singleMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const current = this.selectionMessageSubject.getValue();
    if (current !== singleMsg) this.selectionMessageSubject.next(singleMsg);
  
    const hold = performance.now() + 300;
    this.suppressPassiveUntil.set(index, hold);
    this.freezeNextishUntil.set(index, hold);
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
        : (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG);
    } else {
      msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
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

  private getQuestionTypeForIndex(index: number): QuestionType {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (index >= 0 && index < qArr.length ? qArr[index] : undefined) ?? svc.currentQuestion ?? null;
    return q?.type ?? QuestionType.SingleAnswer;
  }
}