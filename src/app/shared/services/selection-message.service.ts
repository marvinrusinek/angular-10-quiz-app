import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

interface OptionSnapshot {
  id: number | string;
  selected: boolean;
  correct?: boolean;
}

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

  // Latch to prevent regressions after a multi question is satisfied
  private completedByIndex = new Map<number, boolean>();

  // Coalesce per index and protect SingleAnswer decisions
  private _lastTokByIndex = new Map<number, number>();
  private _lastTypeByIndex = new Map<number, QuestionType>();

  // At the top of SelectionMessageService (or wherever emitFromClick lives)
  private maxCorrectByIndex: Map<number, number> = new Map();

  // Type lock: if a question is SingleAnswer, block later MultipleAnswer emits for same index
  private _typeLockByIndex = new Map<number, QuestionType>();

  // Coalescer/Locks by stable question key
  private _singleNextLockedByKey: Set<string> = new Set<string>();
  private _lastTokByKey: Map<string, number> = new Map<string, number>();
  private _maxCorrectByKey: Map<string, number> = new Map<string, number>();
  private _typeLockByKey: Map<string, QuestionType> = new Map<string, QuestionType>();
  private _lastTypeByKey: Map<string, QuestionType> = new Map<string, QuestionType>();
  
  // Cache canonical correct count per question key (sticky)
  private _canonCountByKey = new Map<string, number>();

  private latestOptionsSnapshot: ReadonlyArray<OptionSnapshot> | null = null;

  private _runId = 0;                 // increments on detected restart
  private _lastIndexProgress = -1;    // last seen index to detect restarts
  private _snapshotRunId = 0;         // tags snapshots to current run

  private _emitSeq = 0;
  private _lastEmitFrameByKey = new Map<string, number>();

  constructor(
    private quizService: QuizService, 
    private selectedOptionService: SelectedOptionService,
    private route: ActivatedRoute
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
    // Use canonical to enrich snapshot → options (for fields like text)
    const canonical = Array.isArray(q?.options) ? (q!.options as Option[]) : [];

    const priorSnapAsOpts: Option[] = this.getLatestOptionsSnapshotAsOptions(canonical);

    this.ensureStableIds(
      questionIndex,
      canonical,
      this.toOptionArrayWithLookup(q?.options ?? [], canonical),
      priorSnapAsOpts
    );

    const base: Option[] = canonical.length
      ? canonical
      : this.toOptionArrayWithLookup(uiSnapshot, canonical);
  
    // Overlay selection into canonical (correct flags intact)
    const overlaid: Option[] = base.map((o, idx) => {
      const id = this.toStableId(o, idx);
      const selected = selectedKeys.has(id) || !!o.selected;
      return this.toOption(o, idx, selected);
    });
  
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
  
    // UPDATED isMulti to also honor override (>1 implies multi even if canonical/declared are wrong)
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
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Use canonical overlay for correctness (CURRENT payload view)
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    this.ensureStableIds(i0, canonical, snap);
    const overlaid = this.getCanonicalOverlay(i0, snap);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
    
    const expectedOverride = this.getExpectedCorrectCount(i0);
    // FIX: if authored expects more than unionCorrect (e.g., Q4=3 but union=2),
    // use the override as a FLOOR so remaining>0 until all are selected.
    const totalForThisQ =
      (typeof expectedOverride === 'number' && expectedOverride > 0)
        ? Math.max(expectedOverride, Math.max(1, unionCorrect))
        : Math.max(1, unionCorrect);
  
    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1);
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;  // e.g., "Please select an option to continue..."
    }
  
    // Remaining by current payload
    const enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // Classifiers
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // Completion freeze for multi: once completed, always stick to Next/Results
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
    if (isMultiFinal && wasCompleted) {
      const isLastQ = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing
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
  
    // MULTI behavior:
    //  - Before any pick → force "Select N more..." (Q2/Q4 fix)
    //  - While remaining>0 → keep "Select N more..."
    //  - When remaining==0 → Next/Results
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const forced = buildRemainingMsg(Math.max(1, totalForThisQ)); // e.g., "Select 2 more..."
        if (current !== forced) this.selectionMessageSubject.next(forced);
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
  } */
  /* public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Use canonical overlay for correctness (CURRENT payload view)
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    this.ensureStableIds(i0, canonical, snap);
    const overlaid = this.getCanonicalOverlay(i0, snap);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
  
    // ────────────────────────────────────────────────────────────
    // FIX #1: treat expected counts as FLOORS (override / stem / per-index)
    // ────────────────────────────────────────────────────────────
    const expectedOverride = this.getExpectedCorrectCount(i0); // may be undefined
    // derive from stem "Select N ..."
    let stemN = 0;
    try {
      const stem = stripHtml((q as any)?.questionText ?? (q as any)?.question ?? (q as any)?.text ?? '');
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch {}
  
    // optional per-index hard floor (e.g., Q4 expects 3; adjust index if yours differs)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };
  
    // FLOOR, do NOT cap by unionCorrect (this was causing early “Next”)
    const totalForThisQ =
      Math.max(
        Math.max(1, unionCorrect),
        (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride : 0,
        stemN > 0 ? stemN : 0,
        hardFloorByIndex[i0] ?? 0
      );
  
    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1);
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;  // e.g., "Please select an option to continue..."
    }
  
    // Remaining by current payload
    const enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // Classifiers
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // ────────────────────────────────────────────────────────────
    // FIX #2: don't freeze to Next if we still need answers; un-complete it.
    // ────────────────────────────────────────────────────────────
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
    if (isMultiFinal && wasCompleted) {
      if (enforcedRemaining > 0) {
        try {
          (this as any).completedByIndex?.set?.(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
        // fall through and show the correct “Select N more...” below
      } else {
        const isLastQ = i0 === (this.quizService.totalQuestions - 1);
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        return;
      }
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing
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
  
    // MULTI behavior:
    //  - Before any pick → force "Select N more..." (Q2/Q4 fix)
    //  - While remaining>0 → keep "Select N more..."
    //  - When remaining==0 → Next/Results
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const forced = buildRemainingMsg(Math.max(1, totalForThisQ)); // e.g., "Select 2 more..."
        if (current !== forced) this.selectionMessageSubject.next(forced);
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
  } */
  /* public updateSelectionMessage(
    message: string,
    ctx?: {
      options?: Option[];
      index?: number;
      token?: number;
      questionType?: QuestionType;
      minDisplayRemaining?: number; // NEW: cosmetic floor from emitter (optional)
    }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Use canonical overlay for correctness (CURRENT payload view)
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    this.ensureStableIds(i0, canonical, snap);
    const overlaid = this.getCanonicalOverlay(i0, snap);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
    const selectedIncorrect = overlaid.filter(o => !!o?.selected && !(o as any)?.correct).length; // NEW
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
  
    // ────────────────────────────────────────────────────────────
    // FIX #1: treat expected counts as FLOORS (override / stem / per-index)
    // ────────────────────────────────────────────────────────────
    const expectedOverride = this.getExpectedCorrectCount(i0); // may be undefined
    // derive from stem "Select N ..."
    let stemN = 0;
    try {
      const stem = stripHtml((q as any)?.questionText ?? (q as any)?.question ?? (q as any)?.text ?? '');
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch {}
  
    // optional per-index hard floor (e.g., Q4 expects 2; adjust index if yours differs)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };
  
    // FLOOR, do NOT cap by unionCorrect (this was causing early “Next”)
    const totalForThisQ =
      Math.max(
        Math.max(1, unionCorrect),
        (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride : 0,
        stemN > 0 ? stemN : 0,
        hardFloorByIndex[i0] ?? 0
      );
  
    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1);
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;  // e.g., "Please select an option to continue..."
    }
  
    // Remaining by current payload
    const enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // Classifiers
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // ────────────────────────────────────────────────────────────
    // FIX #2: bypass the completed→Next freeze while cosmetic floor is active
    // ────────────────────────────────────────────────────────────
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
  
    // NEW: cosmetic display floor (prefer ctx; else ask service by id/index)
    let minDisp = Math.max(0, Number((ctx as any)?.minDisplayRemaining ?? 0)); // NEW
    if (!minDisp) {
      try {
        const qId = (q as any)?.id != null ? String((q as any).id) : undefined;
        minDisp = Math.max(0, this.quizService.getMinDisplayRemaining(i0, qId));
      } catch {}
    }
    const floorActive = (minDisp > 0 && selectedIncorrect === 0 && selectedCorrect >= 1); // NEW
  
    if (isMultiFinal && wasCompleted) {
      if (enforcedRemaining > 0 || floorActive) { // CHANGED: bypass freeze when floor is active
        try {
          (this as any).completedByIndex?.set?.(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
        // fall through and show the correct “Select N more...” below
      } else {
        const isLastQ = i0 === (this.quizService.totalQuestions - 1);
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        return;
      }
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing
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
  
    // MULTI behavior:
    //  - Before any pick → force "Select N more..." (Q2/Q4 fix)
    //  - While remaining>0 → keep "Select N more..."
    //  - When remaining==0 → Next/Results
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const n = Math.max(1, totalForThisQ);
        const forced = (typeof buildRemainingMsg === 'function')
          ? buildRemainingMsg(n)
          : `Select ${n} more correct option${n === 1 ? '' : 's'} to continue...`; // CHANGED fallback wording
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
  
      // CHANGED: compute displayRemaining with smoothing + cosmetic floor
      let displayRemaining = enforcedRemaining;
      if (inEnforce) displayRemaining = Math.max(displayRemaining, 1);
      if (floorActive) displayRemaining = Math.max(displayRemaining, minDisp);
  
      if (displayRemaining > 0) {
        const forced = (typeof buildRemainingMsg === 'function')
          ? buildRemainingMsg(displayRemaining)
          : `Select ${displayRemaining} more correct option${displayRemaining === 1 ? '' : 's'} to continue...`;
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
  } */
  /* public updateSelectionMessage( 
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; minDisplayRemaining?: number; } // ← added minDisplayRemaining to ctx
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // ────────────────────────────────────────────────────────────
    // NEW — persistent cosmetic floor from emitter (e.g., Q4 forces "1 more")
    // This goes RIGHT AFTER computing i0 and next.
    // 1) Persist a floor per question index so later writers without ctx can't flip to "Next".
    // 2) Immediately rewrite any incoming Next-ish text to a Select message.
    // 3) Clear stale "completed"/freeze latches.
    // ────────────────────────────────────────────────────────────
    const mkSelectMsg = (n: number) =>
      (typeof buildRemainingMsg === 'function'
        ? buildRemainingMsg(n)
        : `Select ${n} more correct answer${n === 1 ? '' : 's'} to continue...`);
  
    // lazy-init store
    // @ts-ignore
    this._minDisplayFloorByIndex ??= new Map<number, number>();
  
    const incomingFloor = Math.max(0, Number((ctx as any)?.minDisplayRemaining ?? 0));
    const storedFloor   = Math.max(0, Number((this as any)._minDisplayFloorByIndex.get(i0) ?? 0));
    let effectiveFloor  = Math.max(incomingFloor, storedFloor);
  
    // Persist strongest floor we know for this index
    if (effectiveFloor > 0) {
      (this as any)._minDisplayFloorByIndex.set(i0, effectiveFloor);
    }
  
    // Rewrite Next-ish → "Select N more..." immediately if we have a floor
    if (effectiveFloor > 0) {
      const lowNext0 = (next ?? '').toLowerCase();
      const isNextishIncoming0 = lowNext0.includes('next button') || lowNext0.includes('show results');
      if (isNextishIncoming0) {
        next = mkSelectMsg(effectiveFloor);
        try {
          (this as any).completedByIndex ??= new Map<number, boolean>();
          (this as any).completedByIndex.set(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
      }
    }
    // ────────────────────────────────────────────────────────────
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Use canonical overlay for correctness (CURRENT payload view)
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    this.ensureStableIds(i0, canonical, snap);
    const overlaid = this.getCanonicalOverlay(i0, snap);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
  
    // ────────────────────────────────────────────────────────────
    // FIX #1: treat expected counts as FLOORS (override / stem / per-index)
    // ────────────────────────────────────────────────────────────
    const expectedOverride = this.getExpectedCorrectCount(i0); // may be undefined
    // derive from stem "Select N ..."
    let stemN = 0;
    try {
      const stem = stripHtml((q as any)?.questionText ?? (q as any)?.question ?? (q as any)?.text ?? '');
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch {}
  
    // optional per-index hard floor (e.g., Q4 expects 2 as a floor for display/gating if data is under-flagged)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };
  
    // FLOOR, do NOT cap by unionCorrect (this was causing early “Next”)
    const totalForThisQ =
      Math.max(
        Math.max(1, unionCorrect),
        (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride : 0,
        stemN > 0 ? stemN : 0,
        hardFloorByIndex[i0] ?? 0
      );
  
    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1) ||
      (effectiveFloor > 0);   // floor implies multi UX
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;  // e.g., "Please select an option to continue..."
    }
  
    // Remaining by current payload (pre-floor)
    let enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // ────────────────────────────────────────────────────────────
    // NEW — honor persistent cosmetic floor (prevents “Next” at sink)
    // Rewrites Next-ish → “Select N more…” and clears freezes while floor is active.
    // ────────────────────────────────────────────────────────────
    {
      const incomingIsNextish = /next button|show results/i.test(next ?? '');
  
      if (effectiveFloor > 0) {
        // 1) Enforce the floor now (visual only)
        enforcedRemaining = Math.max(enforcedRemaining, effectiveFloor);
  
        // 2) Rewrite any incoming Next-ish to "Select N more..."
        if (incomingIsNextish) {
          next = mkSelectMsg(enforcedRemaining);
        }
  
        // 3) Un-complete & clear freezes so "Next" can’t stick
        try {
          (this as any).completedByIndex ??= new Map<number, boolean>();
          (this as any).completedByIndex.set(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
      }
    }
  
    // Classifiers (recomputed if next was rewritten above)
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // ────────────────────────────────────────────────────────────
    // FIX #2: don't freeze to Next if we still need answers; un-complete it.
    // (kept from your version, now also covered by floor handler above)
    // ────────────────────────────────────────────────────────────
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
    if (isMultiFinal && wasCompleted) {
      if (enforcedRemaining > 0) {
        try {
          (this as any).completedByIndex?.set?.(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
        // fall through and show the correct “Select N more...” below
      } else {
        const isLastQ = i0 === (this.quizService.totalQuestions - 1);
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        // Clear any stored floor once we actually allow Next/Results
        (this as any)._minDisplayFloorByIndex.delete(i0);
        return;
      }
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = (typeof performance?.now === 'function') ? performance.now() : Date.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing (kept)
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
  
    // MULTI behavior (kept)
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const forced = buildRemainingMsg(Math.max(1, totalForThisQ)); // e.g., "Select 2 more..."
        if (current !== forced) this.selectionMessageSubject.next(forced);
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
      // Clear any stored floor once we actually allow Next/Results
      (this as any)._minDisplayFloorByIndex.delete(i0);
      return;
    }
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected (kept)
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
  } */
  /* public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; minDisplayRemaining?: number; } // ← added minDisplayRemaining to ctx
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // ────────────────────────────────────────────────────────────
    // FORCE-FLOOR PATCH (unconditional): if emitter sent a floor,
    // always show “Select N more …”, clear freezes, and treat as multi.
    // This avoids depending on specific “Next-ish” wording.
    // ────────────────────────────────────────────────────────────
    const floorFromCtx = Math.max(0, Number((ctx as any)?.minDisplayRemaining ?? 0));
    if (floorFromCtx > 0) {
      next = (typeof buildRemainingMsg === 'function')
        ? buildRemainingMsg(floorFromCtx)
        : `Select ${floorFromCtx} more correct answer${floorFromCtx === 1 ? '' : 's'} to continue...`;
      try {
        (this as any).completedByIndex ??= new Map<number, boolean>();
        (this as any).completedByIndex.set(i0, false);
        this.freezeNextishUntil?.set?.(i0, 0);
        this.suppressPassiveUntil?.set?.(i0, 0);
      } catch {}
    }
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot());
  
    // Use canonical overlay for correctness (CURRENT payload view)
    const snap = optsCtx ?? this.getLatestOptionsSnapshot();
    this.ensureStableIds(i0, canonical, snap);
    const overlaid = this.getCanonicalOverlay(i0, snap);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
  
    // ────────────────────────────────────────────────────────────
    // Treat expected counts as FLOORS (override / stem / per-index)
    // ────────────────────────────────────────────────────────────
    const expectedOverride = this.getExpectedCorrectCount(i0); // may be undefined
  
    // derive from stem "Select N ..."
    let stemN = 0;
    try {
      const stem = stripHtml((q as any)?.questionText ?? (q as any)?.question ?? (q as any)?.text ?? '');
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch {}
  
    // optional per-index hard floor (example remains)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };
  
    // FLOOR, do NOT cap by unionCorrect
    const totalForThisQ =
      Math.max(
        Math.max(1, unionCorrect),
        (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride : 0,
        stemN > 0 ? stemN : 0,
        hardFloorByIndex[i0] ?? 0
      );
  
    // Compute multi after target so we never fall into single branch on multi questions.
    // Also, floorFromCtx > 0 implies multi UX.
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1) ||
      (floorFromCtx > 0);
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;
    }
  
    // Remaining by current payload (pre-floor)
    let enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // While the floor is active, ensure we don’t drop below it
    if (floorFromCtx > 0) {
      enforcedRemaining = Math.max(enforcedRemaining, floorFromCtx);
    }
  
    // Classifiers
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results') || low === 'next';
  
    // If we had previously completed but floor says we still owe answers, un-complete.
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
    if (isMultiFinal && wasCompleted) {
      if (enforcedRemaining > 0) {
        try {
          (this as any).completedByIndex?.set?.(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
      } else {
        const isLastQ = i0 === (this.quizService.totalQuestions - 1);
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        return;
      }
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = (typeof performance?.now === 'function') ? performance.now() : Date.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing (kept)
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
  
    // MULTI behavior (kept)
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const forced = buildRemainingMsg(Math.max(1, totalForThisQ));
        if (current !== forced) this.selectionMessageSubject.next(forced);
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
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected (kept)
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
  } */
  public updateSelectionMessage( 
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; minDisplayRemaining?: number; } // ← added minDisplayRemaining to ctx
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim();  // mutable to normalize START→CONTINUE when needed
    if (!next) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // ────────────────────────────────────────────────────────────
    // STEP 1 (PATCH): Honor cosmetic floor from ctx *immediately*
    // Rewrite any incoming Next-ish message to "Select N more..."
    // NOTE: mutate `next` (the variable used for the rest of the function),
    // not `message`. Also clear stale completion/locks.
    // ────────────────────────────────────────────────────────────
    const floorFromCtx = Math.max(0, Number((ctx as any)?.minDisplayRemaining ?? 0));
    if (floorFromCtx > 0) {
      const incomingIsNextish = /next button|show results/i.test(next);
      if (incomingIsNextish) {
        const n = floorFromCtx;
        next = (typeof buildRemainingMsg === 'function')
          ? buildRemainingMsg(n)
          : `Select ${n} more correct answer${n === 1 ? '' : 's'} to continue...`;
      }
      try {
        (this as any).completedByIndex ??= new Map<number, boolean>();
        (this as any).completedByIndex.set(i0, false);
        this.freezeNextishUntil?.set?.(i0, 0);
        this.suppressPassiveUntil?.set?.(i0, 0);
      } catch {}
    }
  
    // Drop regressive “Select N more” updates (don’t increase visible remaining)
    {
      const parseRemaining = (msg: string): number | null => {
        const m = /select\s+(\d+)\s+more/i.exec(msg);
        return m ? Number(m[1]) : null;
      };
      const curRem = parseRemaining(current);
      const nextRem = parseRemaining(next);
      if (typeof curRem === 'number' && typeof nextRem === 'number' && nextRem > curRem) return;
    }
  
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
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    // Coerce whatever we have into Option[]
    const prevSnapAsOpts: Option[] = this.toOptionArray(this.getLatestOptionsSnapshot());
    const ctxAsOpts: Option[] = this.toOptionArray(optsCtx);

    // Use canonical overlay for correctness (CURRENT payload view)
    this.ensureStableIds(i0, canonical, ctxAsOpts.length ? ctxAsOpts : prevSnapAsOpts);

    const snapOpts: Option[] = ctxAsOpts.length ? ctxAsOpts : prevSnapAsOpts;
    this.ensureStableIds(i0, canonical, snapOpts);
    const overlaid = this.getCanonicalOverlay(i0, snapOpts);
  
    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(o => !!(o as any)?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!(o as any)?.correct && !!o?.selected).length;
  
    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer) ? (q as any).answer : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    // “How many correct actually exist” = union(answer-derived, canonical flags)
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalCorrectCanonical, totalFromAnswer, 0);
  
    // ────────────────────────────────────────────────────────────
    // FIX #1: treat expected counts as FLOORS (override / stem / per-index)
    // ────────────────────────────────────────────────────────────
    const expectedOverride = this.getExpectedCorrectCount(i0); // may be undefined
    // derive from stem "Select N ..."
    let stemN = 0;
    try {
      const stem = stripHtml((q as any)?.questionText ?? (q as any)?.question ?? (q as any)?.text ?? '');
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch { /* ignore */ }
  
    // optional per-index hard floor (e.g., Q4 expects 2 as a floor for display/gating if data is under-flagged)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };
  
    // FLOOR, do NOT cap by unionCorrect (this was causing early “Next”)
    const totalForThisQ =
      Math.max(
        Math.max(1, unionCorrect),
        (typeof expectedOverride === 'number' && expectedOverride > 0) ? expectedOverride : 0,
        stemN > 0 ? stemN : 0,
        hardFloorByIndex[i0] ?? 0
      );
  
    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      (totalForThisQ > 1) ||
      (qTypeDeclared === QuestionType.MultipleAnswer) ||
      (totalCorrectCanonical > 1) ||
      (floorFromCtx > 0);   // floor implies multi UX
  
    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG;  // e.g., "Please select an option to continue..."
    }
  
    // Remaining by current payload (pre-floor)
    let enforcedRemaining = Math.max(0, totalForThisQ - selectedCorrect);
  
    // ────────────────────────────────────────────────────────────
    // Honor cosmetic floor again at the gating layer (visual only)
    // If Next-ish sneaks in later, it’ll be rewritten above already.
    // ────────────────────────────────────────────────────────────
    {
      const incomingIsNextish = /next button|show results/i.test(next ?? '');
      if (floorFromCtx > 0) {
        enforcedRemaining = Math.max(enforcedRemaining, floorFromCtx);
        if (incomingIsNextish) {
          next = (typeof buildRemainingMsg === 'function')
            ? buildRemainingMsg(enforcedRemaining)
            : `Select ${enforcedRemaining} more correct answer${enforcedRemaining === 1 ? '' : 's'} to continue...`;
        }
        try {
          (this as any).completedByIndex ??= new Map<number, boolean>();
          (this as any).completedByIndex.set(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
      }
    }
  
    // Classifiers (recomputed if next was rewritten above)
    const low = (next ?? '').toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // ────────────────────────────────────────────────────────────
    // FIX #2: don't freeze to Next if we still need answers; un-complete it.
    // (kept from your version, now also covered by floor handler above)
    // ────────────────────────────────────────────────────────────
    const wasCompleted = (this as any).completedByIndex?.get(i0) === true;
    if (isMultiFinal && wasCompleted) {
      if (enforcedRemaining > 0) {
        try {
          (this as any).completedByIndex?.set?.(i0, false);
          this.freezeNextishUntil?.set?.(i0, 0);
          this.suppressPassiveUntil?.set?.(i0, 0);
        } catch {}
        // fall through and show the correct “Select N more...” below
      } else {
        const isLastQ = i0 === (this.quizService.totalQuestions - 1);
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        return;
      }
    }
  
    // Suppression windows: block Next-ish flips while suppressed
    const now = (typeof performance?.now === 'function') ? performance.now() : Date.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" smoothing (kept)
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
  
    // MULTI behavior (kept)
    const anySelectedNow = overlaid.some(o => !!o?.selected);
  
    if (isMultiFinal) {
      if (!anySelectedNow) {
        const forced = buildRemainingMsg(Math.max(1, totalForThisQ)); // e.g., "Select 2 more..."
        if (current !== forced) this.selectionMessageSubject.next(forced);
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
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected (kept)
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
  // TEMP: if you know Q4 must have 3 correct, set here to prove data vs logic.
  // Remove after you fix canonical data.
  private expectedTotalCorrectOverride: Record<number, number> = {
    3: 3, // Q4 is zero-based index 3; change if your index differs
  };
  
  /* public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, totalQuestions, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────────────
    // Logging (keep your existing diagnostic view stable)
    // ─────────────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text,
        selected: !!o?.selected,
        correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (if caller sent one)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────────────
    // Helpers (inlined)
    // ─────────────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    // Stable key: prefer ids/values; fall back to normalized text (deterministic)
    const keyOf = (o: any): number | string =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as number | string;
  
    // Selected detector (keeps your stricter behavior and avoids cross-question bleed)
    const anySelectedStrict = (): boolean => {
      if (Array.isArray(options) && options.some((o: any) => !!o?.selected)) return true;
      try {
        const selSvc: any =
          (this as any).selectedOptionService ??
          (this as any).selectionService ??
          (this as any).quizService;
        const ids = selSvc?.getSelectedIdsForQuestion?.(index);
        if (ids instanceof Set) return ids.size > 0;
        if (Array.isArray(ids)) return ids.length > 0;
        if (ids != null) return true;
      } catch {}
      return false;
    };
  
    const selectedCountStrict = (): number =>
      Array.isArray(options)
        ? options.reduce((n, o: any) => n + (o?.selected ? 1 : 0), 0)
        : 0;
  
    // ─────────────────────────────────────────────────────────────────────
    // Resolve canonical question/options from service
    // ─────────────────────────────────────────────────────────────────────
    let qRef: any = undefined;
    let canonicalOpts: Option[] = [];
    let resolvedIndex = index;
  
    try {
      const svc: any = this.quizService as any;
      const qArr: any[] = Array.isArray(svc?.questions) ? svc.questions : [];
      const svcIdx = (svc?.currentQuestionIndex != null) ? Number(svc.currentQuestionIndex) : null;
      if (svcIdx != null && svcIdx >= 0 && svcIdx < qArr.length) {
        resolvedIndex = svcIdx;
      }
      qRef = (resolvedIndex >= 0 && resolvedIndex < qArr.length) ? qArr[resolvedIndex] : svc?.currentQuestion;
      canonicalOpts = Array.isArray(qRef?.options) ? (qRef.options as Option[]) : [];
    } catch {}
  
    // Build a stable question key (used by your locks if you keep them)
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
  
    const qKey: string =
      (qRef?.id != null) ? `id:${String(qRef.id)}`
      : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
      : `opts:${optionSig(options?.length ? options : canonicalOpts)}`;
  
    // ─────────────────────────────────────────────────────────────────────
    // (Optional) normalize payload IDs from canonical by text so keys align
    // ─────────────────────────────────────────────────────────────────────
    try {
      const canonByText = new Map<string, any>();
      for (const c of (canonicalOpts ?? [])) {
        const ct = norm(c?.text ?? '');
        if (ct) canonByText.set(ct, c);
      }
      for (const o of (options ?? [])) {
        const t = norm(o?.text ?? '');
        if (t && o && (o as any).optionId == null) {
          const c = canonByText.get(t);
          if (c?.optionId != null) (o as any).optionId = c.optionId;
          if (c?.value != null && (o as any).value == null) (o as any).value = c.value;
        }
      }
    } catch {}
  
    // ─────────────────────────────────────────────────────────────────────
    // Effective type: bias to Multi when signals say so (keeps your behavior)
    // ─────────────────────────────────────────────────────────────────────
    const canonCount = canonicalOpts.reduce((n, c: any) => n + (!!c?.correct ? 1 : 0), 0);
    const payloadCorrectCount = (options ?? []).reduce((n, o: any) => n + (!!o?.correct ? 1 : 0), 0);
    const likelyMulti =
      (questionType === QuestionType.MultipleAnswer) ||
      (canonCount > 1) ||
      (payloadCorrectCount > 1);
  
    let effType: QuestionType = questionType;
    if (canonCount > 1) effType = QuestionType.MultipleAnswer;
    else if (canonCount === 1) effType = QuestionType.SingleAnswer;
    else if (payloadCorrectCount > 1) effType = QuestionType.MultipleAnswer;
    else if (payloadCorrectCount === 1 && effType !== QuestionType.MultipleAnswer) effType = QuestionType.SingleAnswer;
    if (effType !== QuestionType.MultipleAnswer && likelyMulti) {
      effType = QuestionType.MultipleAnswer; // prevent early "Next" on multi
    }
  
    // ─────────────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = anySelectedStrict();
      const msg = anySelected
        ? (typeof NEXT_BTN_MSG === 'string' ? NEXT_BTN_MSG : 'Please click the next button to continue.')
        : (typeof START_MSG === 'string' ? START_MSG : 'Please select an option to continue.');
      queueMicrotask(() => {
        this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
      });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — STRICT CANONICAL + STABLE KEYS
    // ─────────────────────────────────────────────────────────────────────
    {
      // 1) Canonical correct key set (source of truth)
      const canonicalCorrectKeys = new Set<string | number>(
        (canonicalOpts ?? []).filter((c: any) => !!c?.correct).map((c: any) => keyOf(c))
      );
      const hasCanonical = canonicalCorrectKeys.size > 0;
  
      // 2) If no canonical, payload "correct" as fallback judge set
      const payloadCorrectKeys = new Set<string | number>(
        (options ?? []).filter((o: any) => !!o?.correct).map((o: any) => keyOf(o))
      );
  
      // 3) Selected keys (current payload)
      const selectedKeys = new Set<string | number>(
        (options ?? []).filter((o: any) => !!o?.selected).map((o: any) => keyOf(o))
      );
  
      // 4) Count selected-correct strictly by canonical when available
      const selectedCorrect = hasCanonical
        ? [...selectedKeys].filter(k => canonicalCorrectKeys.has(k)).length
        : [...selectedKeys].filter(k => payloadCorrectKeys.has(k)).length;
  
      // 5) Expected total: canonical > svc > payload > conservative 2
      let expectedTotal = hasCanonical
        ? canonicalCorrectKeys.size
        : Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex));
  
      if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
        const svcAlt = Number((this.quizService as any)?.getExpectedCorrectCount?.(resolvedIndex));
        expectedTotal = Number.isFinite(svcAlt) && svcAlt > 0 ? svcAlt : payloadCorrectKeys.size;
      }
      if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
        expectedTotal = 2; // last resort to keep multi gating coherent
      }
  
      // Only if canonical is absent, allow stem-derived “Select N …”
      if (!hasCanonical) {
        try {
          const stemSrc = String(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
          const m = /select\s+(\d+)/i.exec(stemSrc);
          const stemN = m ? Number(m[1]) : 0;
          if (Number.isFinite(stemN) && stemN > 0) {
            expectedTotal = Math.max(expectedTotal, stemN);
          }
        } catch {}
      }
  
      // 6) Remaining (authoritative)
      const remaining = Math.max(expectedTotal - selectedCorrect, 0);
  
      // 7) Cosmetic floor (never override completion)
      const configuredFloor = Math.max(0, Number((this.quizService as any)?.getMinDisplayRemaining?.(resolvedIndex, qRef?.id) ?? 0));
      let localFloor = 0;
      if (
        remaining > 0 &&
        expectedTotal >= 2 &&
        selectedCountStrict() > 0 &&
        selectedCountStrict() < expectedTotal
      ) {
        localFloor = 1; // keep “Select 1 more …” while building up picks
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, configuredFloor, localFloor);
  
      // 8) Message
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : (typeof NEXT_BTN_MSG === 'string'
              ? NEXT_BTN_MSG
              : 'Please click the next button to continue.');
  
      // 9) Emit (microtask reinforce pattern retained)
      this.updateSelectionMessage(
        msg,
        { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok } as any
      );
      queueMicrotask(() => {
        this.updateSelectionMessage(
          msg,
          { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok } as any
        );
      });
  
      // Debug (optional): uncomment if Q2 still misbehaves
      // console.log('[emitFromClick][dbg]', {
      //   expectedTotal, selectedCorrect, remaining, displayRemaining,
      //   canonicalCorrectKeys: [...canonicalCorrectKeys],
      //   selectedKeys: [...selectedKeys]
      // });
    }
  } */
  public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, totalQuestions, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────────────
    // Logging (keep your existing diagnostic view stable)
    // ─────────────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text,
        selected: !!o?.selected,
        correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (if caller sent one)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────────────
    // RUN DETECTION & STATE RESET (prelude) — prevents cross-run bleed
    // (assumes you added: _runId, _lastIndexProgress, _snapshotRunId and reset code)
    // ─────────────────────────────────────────────────────────────────────
    // @ts-ignore
    this._runId ??= 0;
    // @ts-ignore
    this._lastIndexProgress ??= -1;
    // @ts-ignore
    this._snapshotRunId ??= 0;
  
    let detectedRestart = false;
    if ((this._lastIndexProgress as number) > 0 && index === 0) detectedRestart = true;
    if ((this._lastIndexProgress as number) - index >= 2) detectedRestart = true;
  
    if (detectedRestart) {
      this._runId++;
      try { (this as any)._multiNextLockedByKey?.clear?.(); } catch {}
      try { (this as any)._singleNextLockedByKey?.clear?.(); } catch {}
      try { (this as any)._lastTokByKey?.clear?.(); } catch {}
      try { (this as any)._lastTypeByKey?.clear?.(); } catch {}
      try { (this as any)._typeLockByKey?.clear?.(); } catch {}
      try { (this as any)._canonCountByKey?.clear?.(); } catch {}
      try { (this as any)._maxCorrectByKey?.clear?.(); } catch {}
      try { (this as any).completedByIndex?.clear?.(); } catch {}
      try { (this as any).freezeNextishUntil?.clear?.(); } catch {}
      try { (this as any).suppressPassiveUntil?.clear?.(); } catch {}
      try { this.setLatestOptionsSnapshot?.([]); } catch {}
      // also clear frame guards on restart
      this._lastEmitFrameByKey.clear();
      // @ts-ignore
      this._snapshotRunId = this._runId;
    }
    // @ts-ignore
    this._lastIndexProgress = index;
  
    // ─────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    const softNorm = (s: any) =>
      (s ?? '').toString().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  
    const idKey = (v: any) => (v != null) ? `id:${String(v)}` : '';
    const tKey  = (t: any) => `t:${norm(t)}`;
    const tsKey = (t: any) => `ts:${softNorm(t)}`;
  
    const kOf = (o: any): string => {
      const id = o?.optionId ?? o?.id ?? o?.value;
      if (id != null) return idKey(id);
      return tKey(o?.text ?? '');
    };
  
    // Multiset helpers (bags)
    const bagAdd = (bag: Map<string, number>, k: string, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = (bag: Map<string, number>, k: string) =>
      (bag.get(k) ?? 0);
    const bagSum = (bag: Map<string, number>) =>
      [...bag.values()].reduce((a, b) => a + b, 0);
    const bagIntersectCount = (A: Map<string, number>, B: Map<string, number>) => {
      let s = 0;
      for (const [k, a] of A) {
        const b = B.get(k) ?? 0;
        if (b > 0) s += Math.min(a, b);
      }
      return s;
    };
  
    // ─────────────────────────────────────────────────────────────────────
    // Resolve canonical from service (STRICT by param index)
    // ─────────────────────────────────────────────────────────────────────
    let qRef: any = undefined;
    let canonicalOpts: Option[] = [];
    let resolvedIndex = index;
  
    try {
      const svc: any = this.quizService as any;
      const qArr: any[] = Array.isArray(svc?.questions) ? svc.questions : [];
  
      if (resolvedIndex < 0 || resolvedIndex >= qArr.length) {
        const svcIdx = (svc?.currentQuestionIndex != null) ? Number(svc.currentQuestionIndex) : -1;
        if (svcIdx >= 0 && svcIdx < qArr.length) resolvedIndex = svcIdx;
      }
  
      qRef = (resolvedIndex >= 0 && resolvedIndex < qArr.length) ? qArr[resolvedIndex] : svc?.currentQuestion;
      canonicalOpts = Array.isArray(qRef?.options) ? (qRef.options as Option[]) : [];
    } catch {}
  
    // Build stable question key — include runId to isolate restarts
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
  
    // @ts-ignore
    const runId: number = this._runId ?? 0;
    const qKey: string =
      `run:${runId}|idx:${resolvedIndex}|` + (
        (qRef?.id != null) ? `id:${String(qRef.id)}`
        : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
        : `opts:${optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []))}`
      );
  
    // Frame guard: only the latest compute for this qKey may update the message
    const frame = ++this._emitSeq;
    this._lastEmitFrameByKey.set(qKey, frame);
    const tryEmit = (msg: string) => {
      if (this._lastEmitFrameByKey.get(qKey) !== frame) return; // stale
      this.updateSelectionMessage(
        msg,
        { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok } as any
      );
    };
  
    // Align payload IDs from canonical by text
    try {
      const canonByText = new Map<string, any>();
      for (const c of (canonicalOpts ?? [])) {
        const ct = norm(c?.text ?? '');
        if (ct) canonByText.set(ct, c);
      }
      for (const o of (options ?? [])) {
        const t = norm(o?.text ?? '');
        if (t && o && (o as any).optionId == null) {
          const c = canonByText.get(t);
          if (c?.optionId != null) (o as any).optionId = c.optionId;
          if (c?.value != null && (o as any).value == null) (o as any).value = c.value;
        }
      }
    } catch {}
  
    // Effective type (bias to Multi)
    const canonCount = canonicalOpts.reduce((n, c: any) => n + (!!c?.correct ? 1 : 0), 0);
    const payloadCorrectCount = (options ?? []).reduce((n, o: any) => n + (!!o?.correct ? 1 : 0), 0);
    const likelyMulti =
      (questionType === QuestionType.MultipleAnswer) ||
      (canonCount > 1) ||
      (payloadCorrectCount > 1);
  
    let effType: QuestionType = questionType;
    if (canonCount > 1) effType = QuestionType.MultipleAnswer;
    else if (canonCount === 1) effType = QuestionType.SingleAnswer;
    else if (payloadCorrectCount > 1) effType = QuestionType.MultipleAnswer;
    else if (payloadCorrectCount === 1 && effType !== QuestionType.MultipleAnswer) effType = QuestionType.SingleAnswer;
    if (effType !== QuestionType.MultipleAnswer && likelyMulti) {
      effType = QuestionType.MultipleAnswer;
    }
  
    // SINGLE-ANSWER
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected
        ? (typeof NEXT_BTN_MSG === 'string' ? NEXT_BTN_MSG : 'Please click the next button to continue.')
        : (typeof START_MSG === 'string' ? START_MSG : 'Please select an option to continue.');
      queueMicrotask(() => {
        if (this._lastEmitFrameByKey.get(qKey) === frame) {
          this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
        }
      });
      try { this.setLatestOptionsSnapshot?.(options); /* @ts-ignore */ this._snapshotRunId = runId; } catch {}
      return;
    }
  
    // ─────────────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — provable target (canonical-on-UI + answers-on-UI) + frame guard
    // ─────────────────────────────────────────────────────────────────────
    {
      // UI presence (on-screen)
      const uiBag = new Map<string, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, kOf(o));
      const uiCap = bagSum(uiBag);
  
      // Canonical correct, clamped to UI (proof #1)
      const canonicalBagRaw = new Map<string, number>();
      for (const c of (canonicalOpts ?? [])) if (!!(c as any)?.correct) bagAdd(canonicalBagRaw, kOf(c));
      const canonicalBag = new Map<string, number>();
      for (const [k, c] of canonicalBagRaw) {
        const cap = bagGet(uiBag, k);
        if (cap > 0) bagAdd(canonicalBag, k, Math.min(c, cap));
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Answers on-screen (proof #2)
      const answersBag = new Map<string, number>();
      try {
        const ansArr: any[] = Array.isArray(qRef?.answer) ? qRef.answer : (qRef?.answer != null ? [qRef.answer] : []);
        if (ansArr.length) {
          for (let i = 0; i < canonicalOpts.length; i++) {
            const c: any = canonicalOpts[i];
            const key = kOf(c);
            if (bagGet(uiBag, key) === 0) continue; // not on screen
  
            const cid = String(c?.optionId ?? c?.id ?? i);
            const zeroIx = i, oneIx = i + 1;
            const cVal = norm(c?.value);
            const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
            const matched = ansArr.some((a: any) => {
              if (a == null) return false;
              if (typeof a === 'object') {
                const aid = a?.optionId ?? a?.id;
                if (aid != null && String(aid) === cid) return true;
                const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
                if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
                const av = norm(a?.value);
                const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
                return (!!av && av === cVal) || (!!at && at === cTxt);
              }
              if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
              const s = String(a); const n = Number(s);
              if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
              const ns = norm(s);
              return (!!ns && (ns === cVal || ns === cTxt));
            });
  
            if (matched) bagAdd(answersBag, key);
          }
        }
      } catch {}
      const answersOnUI = bagSum(answersBag);
  
      // Selected (union: payload + service + SAME-RUN snapshot)
      const selId = new Set<string>(), selTx = new Set<string>(), selTs = new Set<string>();
      for (const o of (options ?? [])) if ((o as any)?.selected) {
        const id = o?.optionId ?? (o as any)?.id ?? (o as any)?.value;
        if (id != null) selId.add(idKey(id));
        const t = (o as any)?.text ?? ''; selTx.add(tKey(t)); selTs.add(tsKey(t));
      }
      try {
        const selSvc: any =
          (this as any).selectedOptionService ??
          (this as any).selectionService ??
          (this as any).quizService;
        const raw = selSvc?.getSelectedIdsForQuestion?.(resolvedIndex);
        const arr = raw instanceof Set ? Array.from(raw) : (Array.isArray(raw) ? raw : (raw != null ? [raw] : []));
        for (const a of arr) {
          if (typeof a === 'object') {
            const id = (a as any)?.optionId ?? (a as any)?.id ?? (a as any)?.value;
            if (id != null) selId.add(idKey(id));
            const txt = (a as any)?.text; if (txt) { selTx.add(tKey(txt)); selTs.add(tsKey(txt)); }
          } else if (a != null) {
            selId.add(idKey(a));
          }
        }
      } catch {}
      try {
        const snap = this.getLatestOptionsSnapshot?.();
        // @ts-ignore
        if (this._snapshotRunId === runId && Array.isArray(snap) && snap.length) {
          const sigNow = optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []));
          const sigSnap = optionSig(snap as any);
          if (sigNow && sigSnap && sigNow === sigSnap) {
            for (const s of snap as any[]) if ((s as any)?.selected) {
              const id = (s as any)?.optionId ?? (s as any)?.id ?? (s as any)?.value;
              if (id != null) selId.add(idKey(id));
              const t = (s as any)?.text ?? '';
              selTx.add(tKey(t)); selTs.add(tsKey(t));
            }
          }
        }
      } catch {}
  
      // Project union selection onto canonical instances on-screen
      const selectedBag = new Map<string, number>();
      for (const [k, cap] of canonicalBag) {
        let matched = 0;
        if (k.startsWith('id:')) {
          if (selId.has(k)) matched = cap;
        } else {
          const raw = k.startsWith('t:') ? k.slice(2) : '';
          if (selTx.has(`t:${raw}`) || selTs.has(`ts:${raw}`)) matched = cap;
        }
        if (matched > 0) bagAdd(selectedBag, k, matched);
      }
  
      // ── PROVABLE TARGET:
      // Start with canonical-on-UI; raise only with answers-on-UI; cap to UI capacity.
      let target = canonicalInUI;
      target = Math.max(target, Math.min(uiCap, canonicalInUI + answersOnUI));
  
      // If stem/service demands more, allow it only up to provable and UI caps
      let expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex));
      if (!Number.isFinite(expectedFromSvc) || expectedFromSvc < 0) expectedFromSvc = 0;
      let expectedFromStem = 0;
      try {
        const stemSrc = String(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
        const m = /select\s+(\d+)/i.exec(stemSrc);
        const stemN = m ? Number(m[1]) : 0;
        if (Number.isFinite(stemN) && stemN > 0) expectedFromStem = stemN;
      } catch {}
      const demand = Math.max(expectedFromSvc, expectedFromStem);
      target = Math.max(target, Math.min(uiCap, canonicalInUI + answersOnUI, demand));
  
      // Build judge set: canonical + enough answers to meet target (no payload inflation)
      const judgeBag = new Map<string, number>(canonicalBag);
      let need = Math.max(0, target - bagSum(judgeBag));
      if (need > 0) {
        for (const [k, c] of answersBag) {
          if (need <= 0) break;
          const already = bagGet(judgeBag, k);
          const cap = Math.max(0, bagGet(uiBag, k) - already);
          if (cap <= 0) continue;
          const take = Math.min(c, cap, need);
          if (take > 0) {
            bagAdd(judgeBag, k, take);
            need -= take;
          }
        }
      }
  
      // Remaining strictly from bags
      const selectedCorrect = bagIntersectCount(selectedBag, judgeBag);
      const remaining = Math.max(bagSum(judgeBag) - selectedCorrect, 0);
  
      // Cosmetic floor (NEVER mask completion)
      const configuredFloor = Math.max(0, Number((this.quizService as any)?.getMinDisplayRemaining?.(resolvedIndex, qRef?.id) ?? 0));
      const selCount = Array.isArray(options) ? options.reduce((n, o: any) => n + (!!o?.selected ? 1 : 0), 0) : 0;
      const localFloor = (remaining > 0 && bagSum(judgeBag) >= 2 && selCount > 0 && selCount < bagSum(judgeBag)) ? 1 : 0;
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, configuredFloor, localFloor);
  
      // Message (single-shot with frame guard)
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : (typeof NEXT_BTN_MSG === 'string'
              ? NEXT_BTN_MSG
              : 'Please click the next button to continue.');
  
      tryEmit(msg); // no extra microtask send — avoids stale overwrite
  
      // Stamp snapshot to THIS RUN so selection union won’t import stale picks
      try { this.setLatestOptionsSnapshot?.(options); /* @ts-ignore */ this._snapshotRunId = runId; } catch {}
  
      // Debug (enable once if needed)
      // console.log('[EMIT:GATE]', {
      //   runId, qKey, idx: index, resolvedIndex,
      //   canonicalInUI, answersOnUI, target: bagSum(judgeBag),
      //   selectedCorrect, remaining, displayRemaining
      // });
    }
  }
  
  
  
  
  
  
   
  
  /* ───────────── helpers (reuse yours if you already have them) ───────────── */
  
  private bumpMsgToken(i: number): number {
    (this as any).__msgTokByIndex ??= new Map<number, number>();
    const cur = (this as any).__msgTokByIndex.get(i) ?? 0;
    const next = cur + 1;
    (this as any).__msgTokByIndex.set(i, next);
    return next;
  }
  
  private getCanonicalQuestionByIndex(i: number): QuizQuestion | undefined {
    try {
      const svc: any = this.quizService as any;
      const arr = Array.isArray(svc?.questions) ? (svc.questions as QuizQuestion[]) : [];
      if (i >= 0 && i < arr.length) return arr[i];
      return svc?.currentQuestion as QuizQuestion | undefined;
    } catch { return undefined; }
  }
  
  private buildCanonicalMap(options: Option[]): Map<string, { correct: boolean; textKey: string }> {
    const m = new Map<string, { correct: boolean; textKey: string }>();
    for (const o of options ?? []) {
      const k = this.keyFor(o);
      if (!k) continue;
      m.set(k, { correct: !!o.correct, textKey: this.textKey(o?.text) });
    }
    return m;
  }
  
  /** Union of canonical flags with q.answer[] and optional override hook */
  private deriveTotalTarget(
    index: number,
    canonical: Option[],
    canonMap: Map<string, { correct: boolean; textKey: string }>,
    q: { answer?: any } | undefined
  ): number {
    const totalFromFlags = this.countTotalCorrect(canonMap);
  
    // robust parse of q.answer
    const norm = (x: any) => String(x ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray(q?.answer) ? q!.answer : (q?.answer != null ? [q!.answer] : []);
    const answerIdSet = new Set<string>();
  
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i, oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
  
        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n  = Number(a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx);
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
            const av = norm(a?.value);
            const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return (a === zeroIx) || (a === oneIx);
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return (!!ns && (ns === cVal || ns === cTxt));
        });
  
        if (matched) answerIdSet.add(cid);
      }
    }
  
    const totalFromAnswer = answerIdSet.size;
    const unionCorrect = Math.max(totalFromFlags, totalFromAnswer, 0);
  
    // Optional: support your existing override hook if present
    const expectedOverride = (this as any).getExpectedCorrectCount?.(index);
    const target =
      (typeof expectedOverride === 'number' && expectedOverride >= unionCorrect && expectedOverride > 0)
        ? Math.min(expectedOverride, Math.max(1, unionCorrect))
        : Math.max(1, unionCorrect);
  
    return target || 1; // never let it be 0
  }
  

  /* ================= helpers ================= */
  private lookupCanonicalCorrect(
    key: string | null,
    u: Option,
    canonMap: Map<string, { correct: boolean; textKey: string }>
  ): boolean {
    if (key && canonMap.has(key)) return !!canonMap.get(key)!.correct;
    // Fallback by normalized text if IDs don't align
    const tKey = this.textKey(u?.text);
    for (const v of canonMap.values()) {
      if (v.textKey === tKey) return !!v.correct;
    }
    return false;
  }
  
  private keyFor(o?: Option): string | null {
    if (!o) return null;
    if (o.optionId != null) return `id:${o.optionId}`;
    return `tx:${this.textKey(o.text)}`;
  }
  
  private textKey(s: any): string {
    return (typeof s === 'string' ? s : '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  
  private countTotalCorrect(canonMap: Map<string, { correct: boolean }>): number {
    let n = 0; for (const v of canonMap.values()) if (v.correct) n++; return n;
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
    // selectedIds: Set<number|string> built earlier
    const result: Option[] = canonical.length
      ? canonical.map((o, idx) => {
          const id = this.toStableId(o, idx);
          const sel = selectedIds.has(id);
          return this.toOption(o, idx, sel); // ← always an Option
        })
      : source.map((o, idx) => this.toOption(o, idx)); // ← always an Option

    return result; // Option[]
  }
  
  // Gate: if multi & remaining>0, return the forced "Select N more..." message; else null
  // UPDATED: honor expected-correct override and count only SELECTED-CORRECT
  private multiGateMessage(i0: number, qType: QuestionType, overlaid: Option[]): string | null {
    // Decide if this is multi using declared, override, or canonical
    const expectedOverride = this.getExpectedCorrectCount(i0);
    const canonicalCorrect = overlaid.filter(o =>
      !!(o as any)?.correct || !!(o as any)?.isCorrect || String((o as any)?.correct).toLowerCase() === 'true'
    ).length;
  
    const isMulti =
      qType === QuestionType.MultipleAnswer ||
      ((expectedOverride ?? 0) > 1) ||
      (canonicalCorrect > 1);
  
    if (!isMulti) return null;
  
    // Do NOT force "Select ..." before any pick — unless you explicitly want it.
    // If you want to always show remaining even before first pick, set `requirePick=false`.
    const anySelected = overlaid.some(o => !!o?.selected);
    if (!anySelected) {
      // Show remaining for multi before first pick (your recent requirement for Q2/Q4)
      const totalForThisQ =
        (typeof expectedOverride === 'number' && expectedOverride >= 1 && expectedOverride <= canonicalCorrect)
          ? expectedOverride
          : canonicalCorrect;
      return buildRemainingMsg(Math.max(1, totalForThisQ));
    }
  
    // Total required: prefer explicit override if sensible; else canonical count
    const totalForThisQ =
      (typeof expectedOverride === 'number' && expectedOverride >= 1 && expectedOverride <= canonicalCorrect)
        ? expectedOverride
        : canonicalCorrect;
  
    // Count only the selected CORRECT options (overlay truth)
    const selectedCorrect = overlaid.reduce(
      (n, o: any) => n + ((!!o?.selected) && (o?.correct === true || o?.isCorrect === true || String(o?.correct).toLowerCase() === 'true') ? 1 : 0),
      0
    );
  
    const remaining = Math.max(0, totalForThisQ - selectedCorrect);
    if (remaining > 0) return buildRemainingMsg(remaining);
    return null;
  }

  /**
   * Canonical set of correct option IDs for the given index.
   * - Primary: quizService.questions[index].options[].correct
   * - ID resolution: prefers option.optionId, then id, then value; if missing, tries text match.
   * - Returns empty set if canonical not available.
   */
  private getCanonicalCorrectIdSet(index: number, options: Option[]): Set<number | string> {
    const set = new Set<number | string>();
    try {
      const svc: any = this.quizService as any;
      const qArr = Array.isArray(svc?.questions) ? svc.questions : [];
      const q = (index >= 0 && index < qArr.length) ? qArr[index] : svc?.currentQuestion;
      const canonicalOpts: any[] = Array.isArray(q?.options) ? q.options : [];

      // Build a quick lookup by text to recover IDs if canonical lacks IDs
      const textToId = new Map<string, number | string>();
      for (const o of options || []) {
        const id = (o as any)?.optionId ?? (o as any)?.id ?? (o as any)?.value;
        const key = (o as any)?.text ?? (o as any)?.label ?? '';
        if (id != null && key) textToId.set(String(key), id);
      }

      for (const c of canonicalOpts) {
        if (!!c?.correct) {
          // Prefer canonical ID; if absent, map by text to local ID
          let id = c?.optionId ?? c?.id ?? c?.value;
          if (id == null) {
            const key = c?.text ?? c?.label ?? '';
            if (key) id = textToId.get(String(key));
          }
          if (id != null) set.add(id);
        }
      }
    } catch {
      // ignore
    }
    return set;
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
    const snapOpts = this.getLatestOptionsSnapshotAsOptions();
    this.ensureStableIds(index, canonical, options ?? [], snapOpts);
  
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

  // Optional: shallow→minimal projector used by setter
  private projectToSnapshot(o: any): OptionSnapshot {
    return {
      id: this.toStableId(o),
      selected: !!o?.selected,
      // keep correctness if present (canonical overlay may still read it)
      correct: typeof o?.correct === 'boolean' ? o.correct : undefined
    };
  }

  // Read side used elsewhere in your code
  public getLatestOptionsSnapshot(): OptionSnapshot[] {
    const snapAny = this.optionsSnapshotSubject.getValue();
  
    if (this.isSnapshotArray(snapAny)) {
      // Return a fresh array of *exact* OptionSnapshot objects
      const arr = snapAny as OptionSnapshot[];
      return arr.map((s) => ({
        id: s.id,
        selected: !!s.selected,
        // keep 'correct' only if it's a boolean; otherwise omit/undefined
        correct: typeof s.correct === 'boolean' ? s.correct : undefined,
      }));
    }
  
    if (this.isOptionArray(snapAny)) {
      // Normalize Options -> Snapshots on-the-fly
      const arr = snapAny as Option[];
      return arr.map((o, idx) => this.optionToSnapshot(o, idx));
    }
  
    return [];
  }  

  // Write side used by emitFromClick()
  public setLatestOptionsSnapshot(options: Option[] | null | undefined): void {
    try {
      if (!Array.isArray(options) || options.length === 0) {
        // Clear when no options; callers relying on nullability will handle this
        this.latestOptionsSnapshot = null;
        return;
      }

      // Project to minimal, normalized snapshots
      const snap = options.map(o => this.projectToSnapshot(o));

      // Freeze to avoid accidental mutation downstream
      // (Object.freeze on the array + each element)
      for (const s of snap) Object.freeze(s);
      this.latestOptionsSnapshot = Object.freeze(snap);
    } catch (e) {
      console.warn('[setLatestOptionsSnapshot] failed; clearing snapshot', e);
      this.latestOptionsSnapshot = null;
    }
  }

  // Map a single snapshot -> Option
  private mapSnapshotToOption(
    s: OptionSnapshot,
    lookup?: Map<string | number, Option>
  ): Option {
    // Keep your minimal fields; merge into Option shape your code expects.
    // If your Option interface has more fields, initialize them safely here.
    return {
      optionId: s.id as any,
      selected: !!s.selected,
      correct: typeof s.correct === 'boolean' ? s.correct : false,
      // safe defaults for common fields; customize if you have stricter types
      text: '',
      value: s.id as any,
      showIcon: !!s.selected,
      highlight: !!s.selected,
      feedback: '',
      styleClass: ''
    } as unknown as Option;
  }

  // Coerce (Option[] | OptionSnapshot[]) -> Option[]
  private toOptionArray(input: Option[] | OptionSnapshot[] | null | undefined): Option[] {
    if (!input || !Array.isArray(input) || input.length === 0) return [];
    if (this.isOptionArray(input)) return input as Option[];
    if (this.isSnapshotArray(input)) return (input as OptionSnapshot[]).map(s => this.mapSnapshotToOption(s));
    return [];
  }

  // Type guards
  private isSnapshotArray(input: any): input is OptionSnapshot[] {
    return Array.isArray(input) && input.every(o => 'id' in o && 'selected' in o);
  }
  private isOptionArray(input: any): input is Option[] {
    return Array.isArray(input) && input.every(o => 'optionId' in o || 'id' in o || 'text' in o);
  }

  // Use the same stable-id logic everywhere
  private toStableId(o: any, idx?: number): number | string {
    // 1) Prefer true stable ids if present
    if (o?.optionId != null) return o.optionId as number | string;
    if (o?.id != null)       return o.id as number | string;
    if (o?.value != null)    return o.value as number | string;
  
    // 2) Derive from text if available (stable across renders)
    if (typeof o?.text === 'string' && o.text.trim().length) {
      return `t:${o.text}`; // prefix to avoid clashing with numeric ids
    }
  
    // 3) Fall back to index if provided
    if (typeof idx === 'number') {
      return `i:${idx}`;
    }
  
    // 4) Last-resort constant (still deterministic) – better than Math.random()
    return 'unknown';
  }
  

  // Normalize any candidate into a full Option object
  private toOption(o: any, idx: number, selectedOverride?: boolean): Option {
    const optionId = (typeof o?.optionId === 'number' || typeof o?.optionId === 'string')
      ? o.optionId
      : this.toStableId(o, idx);

    const selected = typeof selectedOverride === 'boolean'
      ? selectedOverride
      : !!o?.selected;

    return {
      // required/expected fields
      optionId: optionId as any,
      text: typeof o?.text === 'string' ? o.text : '',
      correct: !!o?.correct,
      value: (o?.value ?? optionId) as any,
      selected,

      // keep common optional flags consistent
      active: !!o?.active,
      highlight: typeof o?.highlight === 'boolean' ? o.highlight : selected,
      showIcon: typeof o?.showIcon === 'boolean' ? o.showIcon : selected,

      // passthrough optionals with safe defaults
      answer: o?.answer,
      feedback: typeof o?.feedback === 'string' ? o.feedback : '',
      styleClass: typeof o?.styleClass === 'string' ? o.styleClass : ''
    } as Option;
  }

  private optionToSnapshot(o: Option, idx?: number): OptionSnapshot {
    return {
      id: this.toStableId(o, idx),
      selected: !!o.selected,
      correct: typeof o.correct === 'boolean' ? o.correct : undefined,
    };
  }

  public getLatestOptionsSnapshotAsOptions(lookupFrom?: Option[]): Option[] {
    const snaps = this.getLatestOptionsSnapshot();            // OptionSnapshot[]
    return this.toOptionArrayWithLookup(snaps, lookupFrom);   // Option[]
  }

  private toOptionArrayWithLookup(
    input: Option[] | OptionSnapshot[] | null | undefined,
    lookupFrom?: Option[]
  ): Option[] {
    if (!input || !Array.isArray(input) || input.length === 0) return [];
    if (this.isOptionArray(input)) return input as Option[];
    const lookup = Array.isArray(lookupFrom) ? this.buildOptionLookup(lookupFrom) : undefined;
    return (input as OptionSnapshot[]).map(s => this.mapSnapshotToOption(s, lookup));
  }

  private buildOptionLookup(sources: Option[]): Map<string | number, Option> {
    const map = new Map<string | number, Option>();
    sources.forEach((o, idx) => map.set(this.toStableId(o, idx), o));
    return map;
  }
}