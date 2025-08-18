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
  `Select ${remaining} more correct answer${remaining === 1 ? '' : 's'} to continue...`;

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(START_MSG);
  public selectionMessage$: Observable<string> = this.selectionMessageSubject.pipe(
    distinctUntilChanged()
  );

  private optionsSnapshotSubject = new BehaviorSubject<Option[]>([]);
  private writeSeq = 0;
  private latestByIndex = new Map<number, number>();
  private freezeNextishUntil = new Map<number, number>();
  private suppressPassiveUntil = new Map<number, number>();

  private idMapByIndex = new Map<number, Map<string, string | number>>();  // key -> canonicalId

  // Per-question remaining tracker and short enforcement window
  lastRemainingByIndex = new Map<number, number>();
  private enforceUntilByIndex = new Map<number, number>();

  // Force a minimum number of correct answers for specific questions (e.g., Q4 ⇒ 3)
  private expectedCorrectByIndex = new Map<number, number>();
  private expectedCorrectByQid   = new Map<string | number, number>();

  // Tracks selected-correct option ids per question (survives wrong clicks)
  public stickyCorrectIdsByIndex = new Map<number, Set<number | string>>();
  public stickyAnySelectedKeysByIndex = new Map<number, Set<string>>();  // fallback store

  private lastSelectTsByIndex = new Map<number, number>();
  private lastSelectRemainingByIndex = new Map<number, number>();

  private observedCorrectIds = new Map<number, Set<string>>();
  private hardBlockNextishUntilMet = new Map<number, boolean>();

  // Mutes non-payload writes per question for a short window after a payload write
  private payloadGuardUntil = new Map<number, number>();

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
    // Use the latest UI snapshot only to know what's selected…
    const uiSnapshot = this.getLatestOptionsSnapshot();
  
    // Compute correctness from canonical question options (authoritative)
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (questionIndex >= 0 && questionIndex < qArr.length ? qArr[questionIndex] : undefined)
              ?? (svc.currentQuestion as QuizQuestion | undefined)
              ?? null;
  
    // Resolve declared type (may be stale)
    const declaredType: QuestionType | undefined =
      q?.type ?? this.quizService.currentQuestion?.getValue()?.type ?? this.quizService.currentQuestion.value.type;
  
    // Stable key: prefer explicit ids; fall back to value|text (no index cross-pollution)
    const keyOf = (o: any): string | number => {
      if (!o) return '__nil';
      if (o.optionId != null) return o.optionId;
      if (o.id != null) return o.id;
      const val = (o.value ?? '').toString().trim().toLowerCase();
      const txt = (o.text ?? o.label ?? '').toString().trim().toLowerCase();
      return `${val}|${txt}`;
    };
  
    // Build selected key set from UI snapshot…
    const selectedKeys = new Set<string | number>();
    for (let i = 0; i < uiSnapshot.length; i++) {
      const o = uiSnapshot[i];
      if (o?.selected) selectedKeys.add(keyOf(o));
    }
    // …and union with SelectedOptionService (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(questionIndex);
      if (rawSel instanceof Set) rawSel.forEach((id: any) => selectedKeys.add(id));
      else if (Array.isArray(rawSel)) rawSel.forEach((so: any) => selectedKeys.add(keyOf(so)));
    } catch {}

    // Ensure canonical and UI snapshot share the same optionId space
    this.ensureStableIds(questionIndex, (q as any)?.options ?? [], this.getLatestOptionsSnapshot());
  
    // Overlay selection into canonical (correct flags intact)
    const canonical = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const overlaid: Option[] = canonical.length
      ? canonical.map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) }))
      : uiSnapshot.map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) || !!o?.selected })); // fallback
  
    // If the data has >1 correct, treat as MultipleAnswer even if declared type is wrong
    const computedIsMulti = overlaid.filter(o => !!o?.correct).length > 1;
    const qType: QuestionType = 
      computedIsMulti ? QuestionType.MultipleAnswer
      : (declaredType ?? QuestionType.SingleAnswer);
  
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
  
    // Any selection signal (for start/continue copy)
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // Authoritative remaining from canonical correctness and union of selections
    const remaining = this.remainingFromCanonical(index, opts);
  
    // Decide multi from DATA first; fall back to declared type
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const totalCorrect = canonical.filter(o => !!o?.correct).length;
  
    // NEW: expected-correct override (prefer explicit store; fall back to content if available)
    const expectedFromContent =
      (typeof (q as any)?.expectedCorrect === 'number' && (q as any).expectedCorrect > 0)
        ? (q as any).expectedCorrect
        : (Array.isArray((q as any)?.answer) ? (q as any).answer.length : undefined);
  
    const expectedOverride = this.getExpectedCorrectCount(index) ?? expectedFromContent;
  
    // ⬇️ UPDATED isMulti to also honor override (>1 implies multi even if canonical/declared are wrong)
    const isMulti =
      (totalCorrect > 1) ||
      (qType === QuestionType.MultipleAnswer) ||
      ((expectedOverride ?? 0) > 1);
  
    // Count selected CORRECT picks (not just total selections)
    const selectedCorrect = (opts ?? []).reduce(
      (n, o) => n + ((!!o?.correct && !!o?.selected) ? 1 : 0), 0
    );
  
    // If we have an override, use it as the authoritative remaining; else use canonical
    const overrideRemaining =
      (expectedOverride != null) ? Math.max(0, expectedOverride - selectedCorrect) : undefined;
  
    const enforcedRemaining =
      (expectedOverride != null) ? (overrideRemaining as number) : remaining;
  
    // BEFORE ANY PICK:
    // For MULTI, show "Select N more correct answers..." preferring the override if present.
    // For SINGLE, keep START/CONTINUE.
    if (!anySelected) {
      if (isMulti) {
        const initialVisible = (expectedOverride != null) ? expectedOverride : totalCorrect;
        return buildRemainingMsg(initialVisible);
      }
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    if (isMulti) {
      // HARD GATE: never show Next/Results while any enforced remaining > 0
      if (enforcedRemaining > 0) {
        return buildRemainingMsg(enforcedRemaining);
      }
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Single-answer → immediately Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  }
  

  // Build message on click (correct wording and logic)
  public buildMessageFromSelection(params: {
    index: number  // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): string {
    const { index, totalQuestions, questionType, options } = params;
  
    const isLast   = totalQuestions > 0 && index === totalQuestions - 1;
    const correct  = (options ?? []).filter(o => !!o?.correct);
    const selected = correct.filter(o => !!o?.selected).length;
    const isMulti  = questionType === QuestionType.MultipleAnswer;
  
    if (isMulti) {
      const remaining = Math.max(0, correct.length - selected);
      if (remaining > 0) {
        return buildRemainingMsg(remaining);
      }
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Single-answer: after any click, show Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  }
  
  async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const i0 = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
      if (typeof i0 !== 'number' || isNaN(i0) || total <= 0) return;
  
      const qType = this.getQuestionTypeForIndex(i0);
      const isLast = i0 === total - 1;
  
      const overlaid = this.getCanonicalOverlay(i0);
      this.setOptionsSnapshot(overlaid);
  
      const forced = this.multiGateMessage(i0, qType, overlaid);
      if (forced) {
        const cur = this.selectionMessageSubject.getValue();
        if (cur !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
  
      const finalMsg = (qType === QuestionType.MultipleAnswer)
        ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
        : (isAnswered ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                      : (i0 === 0 ? START_MSG : CONTINUE_MSG));
      if (this.selectionMessageSubject.getValue() !== finalMsg) {
        this.selectionMessageSubject.next(finalMsg);
      }
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  }
  
  // Method to update the message  
  /* public updateSelectionMessage( 
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // ─────────────────────────────────────────────────────────────
    // Anti-bounce clamp: if we're already showing "Select N more..."
    // and a late update tries to INCREASE N (e.g., 1 -> 2), ignore it.
    // This avoids the flash you saw on Q2's 3rd click.
    // ─────────────────────────────────────────────────────────────
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) {
        return; // drop regressive update that would increase the visible remaining
      }
    }
    // ─────────────────────────────────────────────────────────────
  
    const qTypeDeclared: QuestionType | undefined =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
  
    // Prefer updated options if provided; else snapshot for our gate
    const optsCtx: Option[] | undefined =
      (Array.isArray(ctx?.options) && ctx!.options!.length ? ctx!.options! : undefined);
  
    // Resolve canonical once
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, (q as any)?.options ?? [], optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Authoritative remaining from canonical + union of selected ids
    const remaining = this.remainingFromCanonical(i0, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Decide multi from data or declared type (canonical is truth)
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const totalCorrect = canonical.filter(o => !!o?.correct).length;
  
    // Honor override when deciding multi (unchanged from your last version)
    const expectedOverrideUM = this.getExpectedCorrectCount(i0);
    const isMulti =
      (totalCorrect > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      //((expectedOverrideUM ?? 0) > 1);
      ((this.getExpectedCorrectCount(i0) ?? 0) > 1);
  
    // NEW: expected-correct override merged with canonical remaining
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    const expectedOverride = this.getExpectedCorrectCount(i0);
  
    // Count only CORRECT selections using canonical overlay
    const overlaidForCorrect = this.getCanonicalOverlay(i0, snap);
    const totalCorrectCanonical = overlaidForCorrect.filter(o => !!o?.correct).length;
    const selectedCorrectCountOverlay  = overlaidForCorrect.filter(o => !!o?.correct && !!o?.selected).length;
  
    // Expected total for this Q: prefer override, else canonical correct count
    const totalForThisQ = (expectedOverride ?? totalCorrectCanonical);
  
    // === BEGIN: override-aware selected-correct calculation (as requested) ===
    // If an override exists, count selected-correct STRICTLY from optsCtx (current payload only).
    // Otherwise, fall back to the overlay count.
    const selectedCorrectFromCtx = Array.isArray(optsCtx)
      ? optsCtx.reduce((n, o) => n + ((!!o?.correct && !!o?.selected) ? 1 : 0), 0)
      : selectedCorrectCountOverlay;
  
    // Enforce remaining using CORRECT picks:
    // - With override: remaining = totalForThisQ - selectedCorrectFromCtx
    // - Without override: remaining = totalForThisQ - selectedCorrectCountOverlay
    const expectedRemainingByCorrect =
      (typeof expectedOverride === 'number' && expectedOverride > 0)
        ? Math.max(0, totalForThisQ - selectedCorrectFromCtx)
        : Math.max(0, totalForThisQ - selectedCorrectCountOverlay);
  
    // Keep canonical guard too by taking the max with `remaining`
    const enforcedRemaining = Math.max(remaining, expectedRemainingByCorrect);
    // === END: override-aware selected-correct calculation ===
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // Suppression windows: block Next-ish flips
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" lock. While remaining>0, force "Select N..." and return.
    const prevRem = this.lastRemainingByIndex.get(i0);
    if (prevRem === undefined || enforcedRemaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, enforcedRemaining);
      if (enforcedRemaining > 0 && (prevRem === undefined || enforcedRemaining < prevRem)) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (enforcedRemaining === 0) this.enforceUntilByIndex.delete(i0);
    }
  
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;
  
    if (isMulti) {
      if (enforcedRemaining > 0 || inEnforce) {
        const forced = buildRemainingMsg(Math.max(1, enforcedRemaining));
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    const anySelected = (snap ?? []).some(o => !!o?.selected);
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
  
    // Stale writer guard (only for ambiguous cases)
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
    const latestToken = this.latestByIndex.get(i0);
    if (inFreeze && ctx?.token !== latestToken) return;
  
    if (current !== next) this.selectionMessageSubject.next(next);
  } */
  /* public updateSelectionMessage( 
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // ─────────────────────────────────────────────────────────────
    // Anti-bounce clamp: if we're already showing "Select N more..."
    // and a late update tries to INCREASE N (e.g., 1 -> 2), ignore it.
    // This avoids the flash you saw on Q2's 3rd click.
    // ─────────────────────────────────────────────────────────────
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) {
        return; // drop regressive update that would increase the visible remaining
      }
    }
    // ─────────────────────────────────────────────────────────────
  
    const qTypeDeclared: QuestionType | undefined =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
  
    // Prefer updated options if provided; else snapshot for our gate
    const optsCtx: Option[] | undefined =
      (Array.isArray(ctx?.options) && ctx!.options!.length ? ctx!.options! : undefined);
  
    // Resolve canonical once
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, (q as any)?.options ?? [], optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Authoritative remaining from canonical + union of selected ids
    const remaining = this.remainingFromCanonical(i0, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Decide multi from data or declared type (canonical is truth)
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const totalCorrect = canonical.filter(o => !!o?.correct).length;
  
    // Honor override when deciding multi (unchanged from your last version)
    const expectedOverrideUM = this.getExpectedCorrectCount(i0);
    const isMulti =
      (totalCorrect > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      //((expectedOverrideUM ?? 0) > 1);
      ((this.getExpectedCorrectCount(i0) ?? 0) > 1);
  
    // NEW: expected-correct override merged with canonical remaining
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    const expectedOverride = this.getExpectedCorrectCount(i0);
  
    // Count only CORRECT selections using canonical overlay
    const overlaidForCorrect = this.getCanonicalOverlay(i0, snap);
    const totalCorrectCanonical = overlaidForCorrect.filter(o => !!o?.correct).length;
    const selectedCorrectCountOverlay  = overlaidForCorrect.filter(o => !!o?.correct && !!o?.selected).length;
  
    // Expected total for this Q: prefer override, else canonical correct count
    const totalForThisQ = (expectedOverride ?? totalCorrectCanonical);
  
    // If an override exists, count selected-correct STRICTLY from optsCtx (current payload only).
    const selectedCorrectFromCtx = Array.isArray(optsCtx)
      ? optsCtx.reduce((n, o) => n + ((!!o?.correct && !!o?.selected) ? 1 : 0), 0)
      : selectedCorrectCountOverlay;
  
    // Enforce remaining using CORRECT picks:
    // - With override: remaining = totalForThisQ - selectedCorrectFromCtx  (authoritative)
    // - Without override: remaining = max(canonical-union gate, overlay-based gate)
    let enforcedRemaining: number;
    if (typeof expectedOverride === 'number' && expectedOverride > 0) {
      const expectedRemainingByCorrect = Math.max(0, totalForThisQ - selectedCorrectFromCtx);
      enforcedRemaining = expectedRemainingByCorrect; // <-- use override path exclusively
    } else {
      const expectedRemainingByCorrect = Math.max(0, totalForThisQ - selectedCorrectCountOverlay);
      enforcedRemaining = Math.max(remaining, expectedRemainingByCorrect);
    }
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // Suppression windows: block Next-ish flips
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" lock. While remaining>0, force "Select N..." and return.
    const prevRem = this.lastRemainingByIndex.get(i0);
    if (prevRem === undefined || enforcedRemaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, enforcedRemaining);
      if (enforcedRemaining > 0 && (prevRem === undefined || enforcedRemaining < prevRem)) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (enforcedRemaining === 0) this.enforceUntilByIndex.delete(i0);
    }
  
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;
  
    if (isMulti) {
      if (enforcedRemaining > 0 || inEnforce) {
        const forced = buildRemainingMsg(Math.max(1, enforcedRemaining));
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    const anySelected = (snap ?? []).some(o => !!o?.selected);
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
  
    // Stale writer guard (only for ambiguous cases)
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
    const latestToken = this.latestByIndex.get(i0);
    if (inFreeze && ctx?.token !== latestToken) return;
  
    if (current !== next) this.selectionMessageSubject.next(next);
  } */
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
  
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) {
        return; // drop regressive update that would increase the visible remaining
      }
    }
    // ─────────────────────────────────────────────────────────────
  
    const qTypeDeclared: QuestionType | undefined =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
  
    // Prefer updated options if provided; else snapshot for our gate
    const optsCtx: Option[] | undefined =
      (Array.isArray(ctx?.options) && ctx!.options!.length ? ctx!.options! : undefined);
  
    // Resolve canonical once
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, (q as any)?.options ?? [], optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Authoritative remaining from canonical + union of selected ids
    const remaining = this.remainingFromCanonical(i0, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Decide multi from data or declared type (canonical is truth)
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const totalCorrectFlags = canonical.filter(o => !!o?.correct).length;
  
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
  
    // 🔧 Re-stamp ids on the snapshot we're about to use for overlay counting
    this.ensureStableIds(i0, canonical, snap);
  
    const expectedOverride = this.getExpectedCorrectCount(i0);
  
    // Count only CORRECT selections using canonical overlay
    const overlaidForCorrect = this.getCanonicalOverlay(i0, snap);
    const totalCorrectCanonical = overlaidForCorrect.filter(o => !!o?.correct).length;
    const selectedCorrectCountOverlay  = overlaidForCorrect.filter(o => !!o?.correct && !!o?.selected).length;
  
    // === prefer: override → robust q.answer count → canonical flags ===
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
  
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
  
    // Build robust answer-id set by checking each canonical option against q.answer
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i;
        const oneIx  = i + 1;
        const cVal   = norm(c?.value);
        const cText  = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
  
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
  
            const idx = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(idx) && (idx === zeroIx || idx === oneIx)) return true;
  
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cText);
          }
  
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
  
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
  
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cText));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    const totalFromAnswer = answerIdSet.size;
  
    const totalForThisQ =
      (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride
        : (totalFromAnswer > 0 ? totalFromAnswer : totalCorrectCanonical);
  
    // === BEGIN: STRICT override-aware calculation (CURRENT payload only, no unions) ===
    // Build source: optsCtx if provided; else snapshot ONLY
    const src: Option[] = Array.isArray(optsCtx) ? optsCtx : this.getLatestOptionsSnapshot();
  
    // 🔧 Re-stamp IDs ON THE EXACT PAYLOAD we are about to evaluate
    this.ensureStableIds(i0, canonical, src);
  
    // Prefer explicit override-correct ids if you set them
    const overrideIds: Set<string> | undefined =
      (this as any).getOverrideCorrectIds?.(i0) ?? undefined;
  
    // Strict canonical flag ids (true/'true'/1)
    const flagIdSet = new Set<string>();
    for (let i = 0; i < canonical.length; i++) {
      const c: any = canonical[i];
      const cid = String(c?.optionId ?? c?.id ?? i);
      const corr = c?.correct;
      if (corr === true || c?.isCorrect === true || String(corr).toLowerCase() === 'true' || Number(corr) === 1) {
        flagIdSet.add(cid);
      }
    }
  
    // Union of authoritative correctness sources
    const correctIdsUnion = new Set<string>();
    if (overrideIds && overrideIds.size) overrideIds.forEach(id => correctIdsUnion.add(String(id)));
    answerIdSet.forEach(id => correctIdsUnion.add(id));
    flagIdSet.forEach(id => correctIdsUnion.add(id));
  
    // Count selected-correct strictly from CURRENT src against the union set
    let selectedCorrectFromSrc = 0;
    for (let i = 0; i < (src?.length ?? 0); i++) {
      const o: any = src[i];
      if (!o?.selected) continue;
      const cid = String(o?.optionId ?? o?.id ?? i);
      if (correctIdsUnion.has(cid)) selectedCorrectFromSrc++;
    }
  
    // Compute the remaining from CURRENT payload
    const remainingByCurrent = Math.max(0, totalForThisQ - selectedCorrectFromSrc);
  
    // Decide enforcedRemaining:
    // - If we have authoritative target (override or answer-derived) → use remainingByCurrent
    // - Else → original behavior (max of canonical union and overlay)
    const hasAuthoritativeTarget =
      (typeof expectedOverride === 'number' && expectedOverride > 0) || (totalFromAnswer > 0);
  
    const enforcedRemaining =
      hasAuthoritativeTarget
        ? remainingByCurrent
        : Math.max(remaining, Math.max(0, totalForThisQ - selectedCorrectCountOverlay));
    // === END: STRICT override-aware calculation ===
  
    // 🔒 Compute multi AFTER totalForThisQ so we never fall into the single branch on Q4
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectFlags > 1);
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // Suppression windows: block Next-ish flips
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" lock. While remaining>0, force "Select N..." and return.
    const prevRem = this.lastRemainingByIndex.get(i0);
    if (prevRem === undefined || enforcedRemaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, enforcedRemaining);
      if (enforcedRemaining > 0 && (prevRem === undefined || enforcedRemaining < prevRem)) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (enforcedRemaining === 0) this.enforceUntilByIndex.delete(i0);
    }
  
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;
  
    // ─────────────────────────────────────────────────────────────
    // Mirror rule for multis: only show "Select ..." AFTER first pick.
    // If authoritative target exists, that gate rules (no "Next" until picked == target).
    // If nothing selected yet, show START/CONTINUE instead of nagging.
    // ─────────────────────────────────────────────────────────────
    const anySelectedFromCtx = Array.isArray(optsCtx) ? optsCtx.some(o => !!o?.selected) : false;
    const anySelectedSnap    = (snap ?? []).some(o => !!o?.selected);
    const anySelectedNow     = anySelectedFromCtx || anySelectedSnap;
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const fallback = (i0 === 0 ? START_MSG : CONTINUE_MSG);
        if (current !== fallback) this.selectionMessageSubject.next(fallback);
        return;
      }
      if (enforcedRemaining > 0 || inEnforce) {
        const forced = buildRemainingMsg(Math.max(1, enforcedRemaining));
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
      const isLastQ = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    const anySelected = anySelectedNow;
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
    const { questionIndex: i0, totalQuestions, questionType, options, token } = params;
  
    if (typeof token === 'number' && this.isWriteFrozen(i0, token)) return;
  
    const overlaid = this.getCanonicalOverlay(i0, options);
    this.setOptionsSnapshot(overlaid);
  
    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
    const forced = this.multiGateMessage(i0, qType, overlaid);
    const msg = forced ??
                (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG);
  
    this.updateSelectionMessage(msg, {
      options: overlaid,
      index: i0,
      token,
      questionType: qType
    });
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
    this.setOptionsSnapshot(options);  // keep existing snapshot
  }

  // HELPERS

  // Prefer explicit ids; otherwise derive a stable key from content (never the index)
  // Prefer canonical/registered id; never fall back to UI index
  private getOptionId(opt: any, _idx: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;

    const key = this.keyOf(opt);
    // Try to resolve via registry (if present for current question)
    const i0 = this.quizService?.currentQuestionIndex ?? 0;
    const map = this.idMapByIndex.get(i0);
    const mapped = map?.get(key);
    if (mapped != null) return mapped;

    // Last resort: use the key itself (content-based, stable)
    return key;
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
   *    so legit Next/Results can show (once remaining === 0). */
   public endWrite(index: number, token?: number, opts?: { clearTokenWindow?: boolean }): void {
    if (typeof token === 'number') {
      const latest = this.latestByIndex.get(index);
      if (latest != null && token !== latest) return;  // stale; ignore
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
  
    // Only frozen if the token matches the latest one and still inside the freeze window
    return token === latest && stillFrozen;
  }

  // Authoritative: call only from the option click with the updated array
  /* public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Keep the previous snapshot so unions can see earlier selections
    // (We won't use it for counting; it's here to keep your structure intact.)
    const priorSnap = this.getLatestOptionsSnapshot();
  
    // Always derive gating from canonical correctness (UI may lack reliable `correct`)
    // Primary: authoritative remaining from canonical and union of selected ids
    // (Kept for single-answer path / legacy; for multi we will rely on selected-correct from *options* only.)
    let remaining = this.remainingFromCanonical(index, options);
  
    // Compute totalCorrect from canonical; fallback to passed array if canonical absent
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    const totalCorrectCanon = canonical.filter(o => !!(o as any)?.correct || !!(o as any)?.isCorrect).length;
    const totalCorrect = totalCorrectCanon > 0
      ? totalCorrectCanon
      : (options ?? []).filter(o => !!(o as any)?.correct || !!(o as any)?.isCorrect).length;  // last-resort fallback
  
    // If canonical was empty and fallback found nothing, remainingFromCanonical would be 0.
    // In that edge case, recompute `remaining` from the passed array so multi still gates.
    if (totalCorrectCanon === 0 && totalCorrect > 0) {
      const selectedCorrectFallback = (options ?? []).filter(
        o => (((o as any)?.correct || (o as any)?.isCorrect) && (o as any)?.selected)
      ).length;
      remaining = Math.max(0, totalCorrect - selectedCorrectFallback);
    }
  
    // Decide multi from canonical first; fall back to declared type
    let isMulti = (totalCorrect > 1) || (questionType === QuestionType.MultipleAnswer);
    const isLast  = totalQuestions > 0 && index === totalQuestions - 1;
  
    // ──────────────────────────────────────────────────────────────────────────
    // NEW: Generic multi-answer gating (answers ∪ flags) × selected-correct from CURRENT payload
    // ──────────────────────────────────────────────────────────────────────────
  
    // Stabilize IDs across sources so mapping by id works when available
    this.ensureStableIds(index, canonical, options, priorSnap);
  
    // Helpers
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const idOf      = (o: any, i: number) => (o?.optionId ?? o?.id ?? i);
    const keyOf     = (o: any, i: number) => {
      const v = norm(o?.value);
      const t = norm(o?.text ?? o?.label ?? o?.title ?? o?.optionText ?? o?.displayText);
      return (v || t) ? `vt:${v}|${t}` : `id:${String(idOf(o, i))}`;
    };
    const asNum = (s: any) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
  
    // Map id -> key for canonical (prefer canonical keys)
    const idToKey = new Map<any, string>();
    const canonKeys: string[] = [];
    for (let i = 0; i < canonical.length; i++) {
      const k = keyOf(canonical[i], i);
      canonKeys[i] = k;
      idToKey.set(idOf(canonical[i], i), k);
    }
  
    // CORRECT-KEYS from flags
    const correctKeysFromFlags = new Set<string>();
    for (let i = 0; i < canonical.length; i++) {
      const c: any = canonical[i];
      const isCorr = !!c?.correct || !!c?.isCorrect || String(c?.correct).toLowerCase() === 'true';
      if (isCorr) correctKeysFromFlags.add(canonKeys[i]);
    }
  
    // CORRECT-KEYS from answers (robust: id | index | value | text)
    const correctKeysFromAnswer = new Set<string>();
    const ans: any = (q as any)?.answer;
    if (Array.isArray(ans) && ans.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid    = idOf(c, i);
        const cv     = norm(c?.value);
        const ct     = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
        const zeroIx = i;       // 0-based
        const oneIx  = i + 1;   // 1-based
  
        const matched = ans.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = (a?.optionId ?? a?.id);
            if (aid != null && String(aid) === String(cid)) return true;
            const aNum = asNum(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (aNum != null && (aNum === zeroIx || aNum === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cv) || (!!at && at === ct);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx) || (String(a) === String(cid));
          const s = String(a);
          const n = asNum(s);
          if (n != null && (n === zeroIx || n === oneIx || String(n) === String(cid))) return true;
          const ns = norm(s);
          return (!!ns && (ns === cv || ns === ct));
        });
  
        if (matched) correctKeysFromAnswer.add(canonKeys[i]);
      }
    }
  
    // Union the two sources of truth
    const correctKeySet = new Set<string>([
      ...correctKeysFromFlags,
      ...correctKeysFromAnswer
    ]);
  
    // How many correct answers should be selected to proceed?
    const expectedOverride = this.getExpectedCorrectCount(index);
    const target =
      (typeof expectedOverride === 'number' && expectedOverride > 0)
        ? expectedOverride
        : (correctKeySet.size > 0 ? correctKeySet.size : totalCorrect);
  
    // If target indicates multi, honor it (helps when declared type is wrong)
    if (target > 1) isMulti = true;
  
    // Count selected-correct STRICTLY from the CURRENT click payload (`options`)
    let selectedCorrectNow = 0;
    for (let i = 0; i < (options?.length ?? 0); i++) {
      const o: any = options[i];
      if (!o?.selected) continue;
      // map to canonical key (prefer id mapping)
      const k = (o?.optionId != null || o?.id != null)
        ? (idToKey.get(idOf(o, i)) ?? keyOf(o, i))
        : keyOf(o, i);
  
      // If we have a correctKeySet from answers/flags, use it; otherwise fall back to `o.correct`
      const isCorrectByUnion = correctKeySet.size > 0 ? correctKeySet.has(k)
                                                      : (!!o?.correct || !!o?.isCorrect || String(o?.correct).toLowerCase() === 'true');
      if (isCorrectByUnion) selectedCorrectNow++;
    }
  
    // Remaining for multi based on CURRENT selection only
    const remainingClick = Math.max(0, Math.max(0, target) - selectedCorrectNow);
  
    // ──────────────────────────────────────────────────────────────────────────
    // Decisive click behavior (with freeze to avoid flashes)
    // ──────────────────────────────────────────────────────────────────────────
    if (isMulti) {
      if (remainingClick > 0) {
        const msg = buildRemainingMsg(remainingClick);   // e.g., "Select 1 more correct answer..."
        const cur = this.selectionMessageSubject.getValue();
        if (cur !== msg) this.selectionMessageSubject.next(msg);
  
        const now  = performance.now();
        const hold = now + 1200;
        this.suppressPassiveUntil.set(index, hold);
        this.freezeNextishUntil.set(index, hold);
  
        // Update snapshot after the decision
        this.setOptionsSnapshot(options);
        return; // never emit Next while remaining > 0
      }
  
      // remainingClick === 0 → legit Next/Results immediately
      const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== msg) this.selectionMessageSubject.next(msg);
  
      const now  = performance.now();
      const hold = now + 300;
      this.suppressPassiveUntil.set(index, hold);
      this.freezeNextishUntil.set(index, hold);
  
      // Update snapshot after the decision
      this.setOptionsSnapshot(options);
      return;
    }
  
    // Single-answer → always Next/Results after any pick
    const singleMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const cur2 = this.selectionMessageSubject.getValue();
    if (cur2 !== singleMsg) this.selectionMessageSubject.next(singleMsg);
  
    const now2  = performance.now();
    const hold2 = now2 + 300;
    this.suppressPassiveUntil.set(index, hold2);
    this.freezeNextishUntil.set(index, hold2);
  
    // Update snapshot after the decision
    this.setOptionsSnapshot(options);
  } */
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
  }): void {
    const { index, totalQuestions, questionType, options } = params;

    // Keep the previous snapshot so unions can see earlier selections
    // (We won't use it for counting; it's here to keep your structure intact.)
    const priorSnap = this.getLatestOptionsSnapshot();

    // Always derive gating from canonical correctness (UI may lack reliable `correct`)
    // Primary: authoritative remaining from canonical and union of selected ids
    // (Kept for single-answer path / legacy; for multi we will rely on selected-correct from *options* only.)
    let remaining = this.remainingFromCanonical(index, options);

    // Compute totalCorrect from canonical; fallback to passed array if canonical absent
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];

    const totalCorrectCanon = canonical.filter(o => !!(o as any)?.correct || !!(o as any)?.isCorrect).length;
    const totalCorrect = totalCorrectCanon > 0
      ? totalCorrectCanon
      : (options ?? []).filter(o => !!(o as any)?.correct || !!(o as any)?.isCorrect).length;  // last-resort fallback

    // If canonical was empty and fallback found nothing, remainingFromCanonical would be 0.
    // In that edge case, recompute `remaining` from the passed array so multi still gates.
    if (totalCorrectCanon === 0 && totalCorrect > 0) {
      const selectedCorrectFallback = (options ?? []).filter(
        o => (((o as any)?.correct || (o as any)?.isCorrect) && (o as any)?.selected)
      ).length;
      remaining = Math.max(0, totalCorrect - selectedCorrectFallback);
    }

    // Decide multi from canonical first; fall back to declared type
    let isMulti = (totalCorrect > 1) || (questionType === QuestionType.MultipleAnswer);
    const isLast  = totalQuestions > 0 && index === totalQuestions - 1;

    // ──────────────────────────────────────────────────────────────────────────
    // NEW: Generic multi-answer gating (answers ∪ flags) × selected-correct from CURRENT payload
    // ──────────────────────────────────────────────────────────────────────────

    // Stabilize IDs across sources so mapping by id works when available
    this.ensureStableIds(index, canonical, options, priorSnap);

    // Helpers
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const idOf      = (o: any, i: number) => (o?.optionId ?? o?.id ?? i);
    const keyOf     = (o: any, i: number) => {
      const v = norm(o?.value);
      const t = norm(o?.text ?? o?.label ?? o?.title ?? o?.optionText ?? o?.displayText);
      return (v || t) ? `vt:${v}|${t}` : `id:${String(idOf(o, i))}`;
    };
    const asNum = (s: any) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    // Map id -> key for canonical (prefer canonical keys)
    const idToKey = new Map<any, string>();
    const canonKeys: string[] = [];
    for (let i = 0; i < canonical.length; i++) {
      const k = keyOf(canonical[i], i);
      canonKeys[i] = k;
      idToKey.set(idOf(canonical[i], i), k);
    }

    // CORRECT-KEYS from flags
    const correctKeysFromFlags = new Set<string>();
    for (let i = 0; i < canonical.length; i++) {
      const c: any = canonical[i];
      const isCorr = !!c?.correct || !!c?.isCorrect || String(c?.correct).toLowerCase() === 'true';
      if (isCorr) correctKeysFromFlags.add(canonKeys[i]);
    }

    // CORRECT-KEYS from answers (robust: id | index | value | text)
    const correctKeysFromAnswer = new Set<string>();
    const ans: any = (q as any)?.answer;
    if (Array.isArray(ans) && ans.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid    = idOf(c, i);
        const cv     = norm(c?.value);
        const ct     = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
        const zeroIx = i;       // 0-based
        const oneIx  = i + 1;   // 1-based

        const matched = ans.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = (a?.optionId ?? a?.id);
            if (aid != null && String(aid) === String(cid)) return true;
            const aNum = asNum(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (aNum != null && (aNum === zeroIx || aNum === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cv) || (!!at && at === ct);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx) || (String(a) === String(cid));
          const s = String(a);
          const n = asNum(s);
          if (n != null && (n === zeroIx || n === oneIx || String(n) === String(cid))) return true;
          const ns = norm(s);
          return (!!ns && (ns === cv || ns === ct));
        });

        if (matched) correctKeysFromAnswer.add(canonKeys[i]);
      }
    }

    // Union the two sources of truth
    const correctKeySet = new Set<string>([
      ...correctKeysFromFlags,
      ...correctKeysFromAnswer
    ]);

    // How many correct answers should be selected to proceed?
    const expectedOverride = this.getExpectedCorrectCount(index);

    // Compute how many correct answers actually exist (flags and answer metadata).
    const realCorrectCount =
      correctKeySet.size > 0 ? correctKeySet.size : totalCorrect;

    // Apply override if provided, otherwise use the real count.
    let target =
      typeof expectedOverride === 'number' && expectedOverride > 0
        ? expectedOverride
        : realCorrectCount;

    // Clamp the target so we never demand more correct answers than actually exist.
    if (target > realCorrectCount) {
      target = realCorrectCount;
    }

    // If target indicates multi, honor it (helps when declared type is wrong)
    if (target > 1) isMulti = true;

    // Count selected-correct STRICTLY from the CURRENT click payload (`options`)
    let selectedCorrectNow = 0;
    for (let i = 0; i < (options?.length ?? 0); i++) {
      const o: any = options[i];
      if (!o?.selected) continue;
      // map to canonical key (prefer id mapping)
      const k = (o?.optionId != null || o?.id != null)
        ? (idToKey.get(idOf(o, i)) ?? keyOf(o, i))
        : keyOf(o, i);

      // If we have a correctKeySet from answers/flags, use it; otherwise fall back to `o.correct`
      const isCorrectByUnion = correctKeySet.size > 0 ? correctKeySet.has(k)
                                                      : (!!o?.correct || !!o?.isCorrect || String(o?.correct).toLowerCase() === 'true');
      if (isCorrectByUnion) selectedCorrectNow++;
    }

    // Remaining for multi based on CURRENT selection only
    const remainingClick = Math.max(0, Math.max(0, target) - selectedCorrectNow);

    // ──────────────────────────────────────────────────────────────────────────
    // Decisive click behavior (with freeze to avoid flashes)
    // ──────────────────────────────────────────────────────────────────────────
    if (isMulti) {
      if (remainingClick > 0) {
        const msg = buildRemainingMsg(remainingClick);   // e.g., "Select 1 more correct answer..."
        const cur = this.selectionMessageSubject.getValue();
        if (cur !== msg) this.selectionMessageSubject.next(msg);

        const now  = performance.now();
        const hold = now + 1200;
        this.suppressPassiveUntil.set(index, hold);
        this.freezeNextishUntil.set(index, hold);

        // Update snapshot after the decision
        this.setOptionsSnapshot(options);
        return; // never emit Next while remaining > 0
      }

      // remainingClick === 0 → legit Next/Results immediately
      const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== msg) this.selectionMessageSubject.next(msg);

      const now  = performance.now();
      const hold = now + 300;
      this.suppressPassiveUntil.set(index, hold);
      this.freezeNextishUntil.set(index, hold);

      // Update snapshot after the decision
      this.setOptionsSnapshot(options);
      return;
    }

    // Single-answer → always Next/Results after any pick
    const singleMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const cur2 = this.selectionMessageSubject.getValue();
    if (cur2 !== singleMsg) this.selectionMessageSubject.next(singleMsg);

    const now2  = performance.now();
    const hold2 = now2 + 300;
    this.suppressPassiveUntil.set(index, hold2);
    this.freezeNextishUntil.set(index, hold2);

    // Update snapshot after the decision
    this.setOptionsSnapshot(options);
  }

  
  // Passive: call from navigation/reset/timer-expiry/etc.
  // This auto-skips during a freeze (so it won’t fight the click)
  public emitPassive(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): void {
    const { index: i0, totalQuestions, questionType, options } = params;
  
    // Build the overlaid options first so we can compute a forced multi message
    const overlaid = this.getCanonicalOverlay(i0, options);
    this.setOptionsSnapshot(overlaid);
  
    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
  
    // Try to force a multi-remaining message (even before any pick)
    const forced = this.multiGateMessage(i0, qType, overlaid);
    if (forced) {
      const cur0 = this.selectionMessageSubject.getValue();
      if (cur0 !== forced) this.selectionMessageSubject.next(forced);
      return;  // never emit Next while remaining>0
    }
  
    // Respect click suppression for non-forced messages only
    const until = this.suppressPassiveUntil.get(i0) ?? 0;
    if (performance.now() < until) return;
  
    const anySelected = overlaid.some(o => !!o?.selected);
    const msg = (qType === QuestionType.MultipleAnswer)
      ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
      : (anySelected ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                     : CONTINUE_MSG);
  
    const token = this.beginWrite(i0, 0);
    this.updateSelectionMessage(msg, { options: overlaid, index: i0, token, questionType: qType });
  }
  
  
  
  // Overlay UI/service selection onto canonical options (correct flags intact)
  private getCanonicalOverlay(i0: number, optsCtx?: Option[] | null): Option[] {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? q!.options : [];

    // Collect selected ids from ctx options (if provided)
    const selectedIds = new Set<number | string>();
    const source = Array.isArray(optsCtx) && optsCtx.length ? optsCtx : this.getLatestOptionsSnapshot();
    for (let i = 0; i < (source?.length ?? 0); i++) {
      const o = source[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }

    // Union with current snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < (snap?.length ?? 0); i++) {
      const o = snap[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }

    // Union with SelectedOptionService map (if it stores ids/objs)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(i0);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => {
          const id = (so?.optionId ?? so?.id ?? so?.value ?? idx);
          if (id !== undefined) selectedIds.add(id);
        });
      }
    } catch {}

    // Return canonical with selected overlay (fallback to ctx/source if canonical missing)
    return canonical.length
      ? canonical.map((o, idx) => {
          const id = (o as any)?.optionId ?? idx;
          return { ...o, selected: selectedIds.has(id) };
        })
      : source.map(o => ({ ...o }));
  }
  
  // Gate: if multi & remaining>0, return the forced "Select N more..." message; else null
  // UPDATED: honor expected-correct override and count only SELECTED-CORRECT
  private multiGateMessage(i0: number, qType: QuestionType, overlaid: Option[]): string | null {
    // Decide if this is multi using declared, override, or canonical
    const expectedOverride = this.getExpectedCorrectCount(i0);
  
    // ──────────────────────────────────────────────────────────────────────────
    // NEW: Derive canonical correctness from the quiz question (flags ∪ answers).
    // This makes first-render (before any click) robust even if `overlaid` lacks flags.
    // ──────────────────────────────────────────────────────────────────────────
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc?.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc?.currentQuestion as QuizQuestion | undefined);
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Helpers (mirror emitFromClick)
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const idOf      = (o: any, i: number) => (o?.optionId ?? o?.id ?? i);
    const keyOf     = (o: any, i: number) => {
      const v = norm(o?.value);
      const t = norm(o?.text ?? o?.label ?? o?.title ?? o?.optionText ?? o?.displayText);
      return (v || t) ? `vt:${v}|${t}` : `id:${String(idOf(o, i))}`;
    };
    const asNum = (s: any) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
  
    // Build canonical keys
    const canonKeys: string[] = [];
    for (let i = 0; i < canonical.length; i++) {
      canonKeys[i] = keyOf(canonical[i], i);
    }
  
    // CORRECT-KEYS from flags
    const correctKeysFromFlags = new Set<string>();
    for (let i = 0; i < canonical.length; i++) {
      const c: any = canonical[i];
      const isCorr = !!c?.correct || !!c?.isCorrect || String(c?.correct).toLowerCase() === 'true';
      if (isCorr) correctKeysFromFlags.add(canonKeys[i]);
    }
  
    // CORRECT-KEYS from answers (robust: id | index | value | text)
    const correctKeysFromAnswer = new Set<string>();
    const ans: any = (q as any)?.answer;
    if (Array.isArray(ans) && ans.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid    = idOf(c, i);
        const cv     = norm(c?.value);
        const ct     = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
        const zeroIx = i;       // 0-based
        const oneIx  = i + 1;   // 1-based
  
        const matched = ans.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = (a?.optionId ?? a?.id);
            if (aid != null && String(aid) === String(cid)) return true;
            const aNum = asNum(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (aNum != null && (aNum === zeroIx || aNum === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cv) || (!!at && at === ct);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx) || (String(a) === String(cid));
          const s = String(a);
          const n = asNum(s);
          if (n != null && (n === zeroIx || n === oneIx || String(n) === String(cid))) return true;
          const ns = norm(s);
          return (!!ns && (ns === cv || ns === ct));
        });
  
        if (matched) correctKeysFromAnswer.add(canonKeys[i]);
      }
    }
  
    // Union the two sources of truth for "what is correct" on this question
    const correctKeySet = new Set<string>([
      ...correctKeysFromFlags,
      ...correctKeysFromAnswer
    ]);
  
    // Real number of correct answers available on this question
    const canonicalCorrectFlags = correctKeysFromFlags.size;
    const unionCorrectCount = correctKeySet.size > 0 ? correctKeySet.size : canonicalCorrectFlags;
  
    // Original quick check using declared type/override/flags
    let canonicalCorrect = overlaid.filter(o => !!o?.correct || !!(o as any)?.isCorrect).length;
  
    const isMultiQuick =
      qType === QuestionType.MultipleAnswer ||
      ((expectedOverride ?? 0) > 1) ||
      (canonicalCorrect > 1);
  
    // ──────────────────────────────────────────────────────────────────────────
    // Decide multi with robust union fallback (so first render works)
    // ──────────────────────────────────────────────────────────────────────────
    const isMulti = isMultiQuick || (unionCorrectCount > 1);
    if (!isMulti) return null;
  
    // NEW: Do NOT force "Select ..." before any pick → actually we DO want to show remaining before any pick
    const anySelected = overlaid.some(o => !!o?.selected);
    // Keep variable for clarity; do not early-return on !anySelected.
  
    // Total required: prefer explicit override, else union-correct.
    // Clamp the override so we never require more correct answers than actually exist.
    const totalForThisQ =
      (typeof expectedOverride === 'number' && expectedOverride > 0)
        ? Math.min(expectedOverride, unionCorrectCount)
        : unionCorrectCount;
  
    // Count selected CORRECT options based on union correctness
    // Map overlaid items to canonical/union keys when possible
    const overKeyOf = (o: any, i: number) => {
      // try to align to canonical by id if present
      const id = (o?.optionId ?? o?.id ?? i);
      // if ids match canonical positions, prefer text/value fallback
      return keyOf(o, i);
    };
  
    let selectedCorrect = 0;
    for (let i = 0; i < overlaid.length; i++) {
      const o = overlaid[i] as any;
      if (!o?.selected) continue;
      const k = overKeyOf(o, i);
      const isCorrectByUnion = correctKeySet.size > 0
        ? correctKeySet.has(k)
        : (!!o?.correct || !!o?.isCorrect || String(o?.correct).toLowerCase() === 'true');
      if (isCorrectByUnion) selectedCorrect++;
    }
  
    const remaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // If nothing selected yet and it's multi → show the full required count
    // This makes Q2/Q4 say "Select 2 more correct options to continue..." before the first click.
    if (!anySelected && remaining > 0) {
      return buildRemainingMsg(remaining);
    }
  
    if (remaining > 0) return buildRemainingMsg(remaining);
    return null;
  }
  
  private getQuestionTypeForIndex(index: number): QuestionType {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (index >= 0 && index < qArr.length ? qArr[index] : undefined) ?? svc.currentQuestion ?? null;
    return q?.type ?? QuestionType.SingleAnswer;
  }

  // Authoritative remaining counter: uses canonical correctness and union of selected IDs
  // NOW also enforces an expected-correct override (e.g., Q4 must have 2 selected before Next)
  // Authoritative remaining counter: uses canonical correctness and union of selected IDs
  // UPDATED: if an expected override exists, enforce it by correct selections.
  private remainingFromCanonical(index: number, uiOpts?: Option[] | null): number {
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    if (!canonical.length) return 0;

    // Build union of selected IDs (UI + snapshot + SelectedOptionService)
    const selectedIds = new Set<number | string>();

    if (Array.isArray(uiOpts)) {
      for (let i = 0; i < uiOpts.length; i++) {
        const o = uiOpts[i];
        if (o?.selected) selectedIds.add(this.getOptionId(o, i));
      }
    }

    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const o = snap[i];
      if (o?.selected) selectedIds.add(this.getOptionId(o, i));
    }

    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => selectedIds.add(this.getOptionId(so, idx)));
      }
    } catch {}

    // Count correct & selected-correct from canonical flags
    let totalCorrect = 0;
    let selectedCorrect = 0;
    for (let i = 0; i < canonical.length; i++) {
      const c = canonical[i];
      if (!c?.correct) continue;
      totalCorrect++;
      const id = this.getOptionId(c, i);
      if (selectedIds.has(id)) selectedCorrect++;
    }

    // Canonical remaining
    const canonicalRemaining = Math.max(0, totalCorrect - selectedCorrect);

    // If an override exists for this question, **use it** (by correct selections)
    const expected = this.getExpectedCorrectCount(index);
    if (typeof expected === 'number' && expected > 0) {
      const overrideRemaining = Math.max(0, expected - selectedCorrect);
      return overrideRemaining; // override is authoritative for this question
    }

    return canonicalRemaining;
  }


  // Ensure every canonical option has a stable optionId.
  // Also stamp matching ids onto any UI list passed in.
  // Ensure every canonical option has a stable optionId.
  // Also stamp matching ids onto any UI list(s) passed in.
  // More tolerant keying (value|text|label|title|optionText|displayText) + index fallback.
  private ensureStableIds(
    index: number,
    canonical: Option[] | null | undefined,
    ...uiLists: (Option[] | null | undefined)[]
  ): void {
    const canon = Array.isArray(canonical) ? canonical : [];
    if (!canon.length) return;

    // Robust keying helpers
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const keyOf = (o: any, i: number): string => {
      if (!o) return '__nil';
      // Prefer explicit ids if present
      const id = o.optionId ?? o.id;
      if (id != null) return `id:${String(id)}`;
      // Value/text family (cover all common fields)
      const v = norm(o.value);
      const t = norm(o.text ?? o.label ?? o.title ?? o.optionText ?? o.displayText);
      if (v || t) return `vt:${v}|${t}`;
      // Last resort: align by index if arrays are corresponding
      return `ix:${i}`;
    };

    // Build or reuse mapping for this question
    let fwd = this.idMapByIndex.get(index);
    if (!fwd) fwd = new Map<string, string | number>();

    // Seed/update mapping from canonical
    canon.forEach((c, i) => {
      const k = keyOf(c as any, i);
      let cid = (c as any).optionId ?? (c as any).id;
      if (cid == null) cid = `q${index}o${i}`;  // deterministic fallback id
      (c as any).optionId = cid;                // stamp canonical
      fwd!.set(k, cid);                         // key match
      fwd!.set(`ix:${i}`, cid);                 // index alignment fallback
    });
    this.idMapByIndex.set(index, fwd!);

    // Stamp ids onto any provided UI lists using key → id, then fall back to index
    for (const list of uiLists) {
      if (!Array.isArray(list)) continue;
      list.forEach((o, i) => {
        const k = keyOf(o as any, i);
        let cid = fwd!.get(k);
        if (cid == null) cid = fwd!.get(`ix:${i}`);   // index fallback saves "first option" cases
        if (cid != null) (o as any).optionId = cid;
      });
    }
  }

  // Prefer to set by a stable question id
  public setExpectedCorrectCountForId(qid: string | number, count: number): void {
    if ((qid !== null && qid !== undefined) && Number.isFinite(count) && count > 0) {
      this.expectedCorrectByQid.set(qid, count);
    }
  }

  public setExpectedCorrectCount(index: number, count: number): void {
    if (Number.isInteger(index) && index >= 0 && Number.isFinite(count) && count > 0) {
      this.expectedCorrectByIndex.set(index, count);
    }
  }
  
  public getExpectedCorrectCount(index: number): number | undefined {
    // 1) exact index match (what you have today)
    const fromIndex = this.expectedCorrectByIndex.get(index);
    if (typeof fromIndex === 'number' && fromIndex > 0) return fromIndex;
  
    // 2) resolve the question object and try an id-based override
    try {
      const svc: any = this.quizService as any;
      const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
      const q: any =
        (index >= 0 && index < arr.length ? arr[index] : undefined) ??
        (svc.currentQuestion as QuizQuestion | undefined);
  
      const qid = q?.id ?? q?._id ?? q?.questionId ?? q?.uuid;
      if (qid !== undefined && qid !== null) {
        const fromId = this.expectedCorrectByQid.get(qid);
        if (typeof fromId === 'number' && fromId > 0) return fromId;
      }
    } catch { /* noop */ }
  
    return undefined;
  }  

  // Resolve the set of correct option IDs for a question.
  // Prefer metadata (q.answer) and fall back to canonical `correct` flags.
  // Resolve the set of correct option IDs for a question.
  // Prefer metadata (q.answer) and fall back to canonical `correct` flags.
  // UPDATED: strict matching only (id / optionId / numeric index). No value/text fuzz.
  private getCorrectIdSet(index: number): Set<number | string> {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const ids = new Set<number | string>();
    if (!canonical.length) return ids;

    // Ensure canonical is stamped with stable optionId
    this.ensureStableIds(index, canonical);

    // Helper: convert possibly 1-based or 0-based indices to canonical optionId
    const idFromIndex = (ix: number): number | string | null => {
      if (!Number.isFinite(ix)) return null;
      const zero = Math.trunc(ix);
      // allow both 0-based and 1-based references
      const candidates = [zero, zero - 1];
      for (const cand of candidates) {
        if (cand >= 0 && cand < canonical.length) {
          const c: any = canonical[cand];
          return (c?.optionId ?? c?.id ?? cand);
        }
      }
      return null;
      };

    // 1) Prefer explicit answer metadata if present (STRICT: id/optionId or numeric index only)
    const ans: any = (q as any)?.answer;
    if (Array.isArray(ans) && ans.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = (c?.optionId ?? c?.id ?? i);

        const matched = ans.some((a: any) => {
          if (a == null) return false;

          // Object with id/optionId or explicit numeric index
          if (typeof a === 'object') {
            if (a.optionId != null && String(a.optionId) === String(cid)) return true;
            if (a.id != null && String(a.id) === String(cid)) return true;
            const idxFields = [a.index, a.idx, a.ordinal, a.optionIndex, a.optionIdx];
            for (const f of idxFields) {
              if (Number.isFinite(f)) {
                const mapped = idFromIndex(Number(f));
                if (mapped != null && String(mapped) === String(cid)) return true;
              }
            }
            return false; // strict: do NOT fall back to value/text string matching
          }

          // Number or numeric string → index or direct id
          if (typeof a === 'number') {
            const mapped = idFromIndex(a);
            if (mapped != null && String(mapped) === String(cid)) return true;
            // also allow direct id equality if author used raw numeric ids in answer
            if (String(a) === String(cid)) return true;
            return false;
          }

          // String → numeric only (no fuzzy text/value matching)
          const s = String(a).trim();
          if (s === '') return false;
          const num = Number(s);
          if (Number.isFinite(num)) {
            const mapped = idFromIndex(num);
            if (mapped != null && String(mapped) === String(cid)) return true;
            if (String(num) === String(cid)) return true;
          } else {
            // also allow exact id string equality (when answer stores the exact optionId string)
            if (s === String(cid)) return true;
          }
          return false;
        });

        if (matched) ids.add(cid);
      }
    }

    // 2) Fallback to canonical `correct` flags ONLY if answer metadata didn't define any
    if (ids.size === 0) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        if (c?.correct === true) {
          ids.add(c?.optionId ?? c?.id ?? i);
        }
      }
    }

    return ids;
  }

  private countSelectedCorrectUnion(index: number, options?: Option[]): number {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Align IDs across sources
    const snap = this.getLatestOptionsSnapshot();
    this.ensureStableIds(index, canonical, options ?? [], snap);
  
    // Union overlay (your existing method already unions sources)
    const overlaid = this.getCanonicalOverlay(index, options ?? []);
  
    // Build trusted correct-id set (prefer q.answer, fallback to flags)
    const correctIds = new Set<number | string>();
    const ans: any = (q as any)?.answer;
    const norm = (x: any) => String(x ?? '').trim().toLowerCase();
  
    if (Array.isArray(ans) && ans.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = c?.optionId ?? c?.id ?? i;
        const val = norm(c?.value);
        const txt = norm(c?.text ?? c?.label);
        const matched = ans.some((a: any) => {
          if (a == null) return false;
          if (a === cid || a === c?.id) return true;
          const s = norm(a);
          return !!s && (s === val || s === txt);
        });
        if (matched) correctIds.add(cid);
      }
    }
    if (correctIds.size === 0) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        if (c?.correct) correctIds.add(c?.optionId ?? c?.id ?? i);
      }
    }
  
    // Count ONLY selected-correct from overlay (union)
    return overlaid.reduce((n, o, i) => {
      const id = (o as any)?.optionId ?? i;
      return n + ((!!o?.selected && correctIds.has(id)) ? 1 : 0);
    }, 0);
  }

  // Optional helper to clear when changing question
  public clearStickyFor(index: number): void {
    this.stickyCorrectIdsByIndex.delete(index);
  }

  // Key that survives reorder/clone/missing ids (NO index fallback)
  private keyOf(o: any): string {
    if (!o) return '__nil';
    const id = (o.optionId ?? o.id);
    if (id != null) return `id:${String(id)}`;
    const v = String(o.value ?? '').trim().toLowerCase();
    const t = String(o.text ?? o.label ?? '').trim().toLowerCase();
    return `vt:${v}|${t}`;
  }

  private parseRemainingFromMessage(msg: string): number | null {
    const m = /select\s+(\d+)\s+more/i.exec(msg);
    return m ? Number(m[1]) : null;
  }

  public registerClick(index: number, optionId: number | string, wasCorrect: boolean, selectedNow = true): void {
    const key = String(optionId);
    let set = this.observedCorrectIds.get(index);
    if (!set) { set = new Set<string>(); this.observedCorrectIds.set(index, set); }
    if (wasCorrect && selectedNow) set.add(key);
    if (!selectedNow) set.delete(key);
  }
  
  private getPickedCorrectCount(index: number): number {
    return this.observedCorrectIds.get(index)?.size ?? 0;
  }
  
  // Clear when navigating to a different question
  public clearObservedFor(index: number): void {
    this.observedCorrectIds.delete(index);
  }
}