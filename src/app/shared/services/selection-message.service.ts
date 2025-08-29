import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { aliasKeys } from '../utils/alias-utils';
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
  `Select ${remaining} more correct answer${
    remaining === 1 ? '' : 's'
  } to continue...`;

interface OptionSnapshot {
  id: number | string;
  selected: boolean;
  correct?: boolean;
}

interface CanonicalOption {
  optionId: string | number;  // Ensure we have a stable key for matching
  text: string;
  correct: boolean;
  value?: string;
}

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(START_MSG);
  public selectionMessage$: Observable<string> =
    this.selectionMessageSubject.pipe(distinctUntilChanged());

  private optionsSnapshotSubject = new BehaviorSubject<Option[]>([]);
  private writeSeq = 0;
  private latestByIndex = new Map<number, number>();
  private freezeNextishUntil = new Map<number, number>();
  private suppressPassiveUntil = new Map<number, number>();

  private idMapByIndex = new Map<number, Map<string, string | number>>(); // key -> canonicalId

  // Per-question remaining tracker and short enforcement window
  lastRemainingByIndex = new Map<number, number>();
  private enforceUntilByIndex = new Map<number, number>();

  // Force a minimum number of correct answers for specific questions (e.g., Q4 ⇒ 3)
  private expectedCorrectByIndex = new Map<number, number>();
  private expectedCorrectByQid = new Map<string | number, number>();

  // Tracks selected-correct option ids per question (survives wrong clicks)
  public stickyCorrectIdsByIndex = new Map<number, Set<number | string>>();
  public stickyAnySelectedKeysByIndex = new Map<number, Set<string>>(); // fallback store

  private observedCorrectIds = new Map<number, Set<string>>();

  // Latch to prevent regressions after a multi question is satisfied
  private completedByIndex = new Map<number, boolean>();

  // Coalesce per index and protect SingleAnswer decisions
  private _lastTokByIndex = new Map<number, number>();
  private _lastTypeByIndex = new Map<number, QuestionType>();

  // Type lock: if a question is SingleAnswer, block later MultipleAnswer emits for same index
  private _typeLockByIndex = new Map<number, QuestionType>();

  private latestOptionsSnapshot: ReadonlyArray<OptionSnapshot> | null = null;

  private _emitSeq = 0;
  private _lastEmitFrameByKey = new Map<string, number>();

  private lastEmit = { index: -1, token: -1, msg: '' };

  private correctCountOverrides: Record<number, number> = { 1: 2 };

  private _canonicalSnapshot: Option[] = [];

  // Cache canonical snapshot and a reconciler per index (payloadKey -> canonicalKey)
  private canonicalCache = new Map<number, Option[]>();
  private reconCache     = new Map<number, Map<string, string>>();

  constructor(
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService
  ) {}

  // Getter for the current selection message
  public getCurrentMessage(): string {
    return this.selectionMessageSubject.getValue(); // get the current message value
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
    const qArr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q =
      (questionIndex >= 0 && questionIndex < qArr.length
        ? qArr[questionIndex]
        : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined) ??
      null;

    // Resolve declared type (may be stale)
    const declaredType: QuestionType | undefined =
      q?.type ??
      this.quizService.currentQuestion?.getValue()?.type ??
      this.quizService.currentQuestion.value.type;

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
      const rawSel: any =
        this.selectedOptionService?.selectedOptionsMap?.get?.(questionIndex);
      if (rawSel instanceof Set)
        rawSel.forEach((id: any) => selectedKeys.add(id));
      else if (Array.isArray(rawSel))
        rawSel.forEach((so: any) => selectedKeys.add(keyOf(so)));
    } catch {}

    // Ensure canonical and UI snapshot share the same optionId space
    // Use canonical to enrich snapshot → options (for fields like text)
    const canonical = Array.isArray(q?.options) ? (q!.options as Option[]) : [];

    const priorSnapAsOpts: Option[] =
      this.getLatestOptionsSnapshotAsOptions(canonical);

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
    const computedIsMulti = overlaid.filter((o) => !!o?.correct).length > 1;
    const qType: QuestionType = computedIsMulti
      ? QuestionType.MultipleAnswer
      : declaredType ?? QuestionType.SingleAnswer;

    return this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType,
      opts: overlaid,
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
    const anySelected = (opts ?? []).some((o) => !!o?.selected);

    // Authoritative remaining from canonical correctness and union of selections
    const remaining = this.remainingFromCanonical(index, opts);

    // Decide multi from DATA first; fall back to declared type
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options)
      ? (q!.options as Option[])
      : [];
    const totalCorrect = canonical.filter((o) => !!o?.correct).length;

    // NEW: expected-correct override (prefer explicit store; fall back to content if available)
    const expectedFromContent =
      typeof (q as any)?.expectedCorrect === 'number' &&
      (q as any).expectedCorrect > 0
        ? (q as any).expectedCorrect
        : Array.isArray((q as any)?.answer)
        ? (q as any).answer.length
        : undefined;

    const expectedOverride =
      this.getExpectedCorrectCount(index) ?? expectedFromContent;

    // UPDATED isMulti to also honor override (>1 implies multi even if canonical/declared are wrong)
    const isMulti =
      totalCorrect > 1 ||
      qType === QuestionType.MultipleAnswer ||
      (expectedOverride ?? 0) > 1;

    // Count selected CORRECT picks (not just total selections)
    const selectedCorrect = (opts ?? []).reduce(
      (n, o) => n + (!!o?.correct && !!o?.selected ? 1 : 0),
      0
    );

    // If we have an override, use it as the authoritative remaining; else use canonical
    const overrideRemaining =
      expectedOverride != null
        ? Math.max(0, expectedOverride - selectedCorrect)
        : undefined;

    const enforcedRemaining =
      expectedOverride != null ? (overrideRemaining as number) : remaining;

    // BEFORE ANY PICK:
    // For MULTI, show "Select N more correct answers..." preferring the override if present.
    // For SINGLE, keep START/CONTINUE.
    if (!anySelected) {
      if (isMulti) {
        const initialVisible =
          expectedOverride != null ? expectedOverride : totalCorrect;
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
    index: number; // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): string {
    const { index, totalQuestions, questionType, options } = params;

    const isLast = totalQuestions > 0 && index === totalQuestions - 1;
    const correct = (options ?? []).filter((o) => !!o?.correct);
    const selected = correct.filter((o) => !!o?.selected).length;
    const isMulti = questionType === QuestionType.MultipleAnswer;

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

      const finalMsg =
        qType === QuestionType.MultipleAnswer
          ? isLast
            ? SHOW_RESULTS_MSG
            : NEXT_BTN_MSG
          : isAnswered
          ? isLast
            ? SHOW_RESULTS_MSG
            : NEXT_BTN_MSG
          : i0 === 0
          ? START_MSG
          : CONTINUE_MSG;
      if (this.selectionMessageSubject.getValue() !== finalMsg) {
        this.selectionMessageSubject.next(finalMsg);
      }
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  }

  // Method to update the message
  public updateSelectionMessage(
    message: string,
    ctx?: {
      options?: Option[];
      index?: number;
      token?: number;
      questionType?: QuestionType;
      minDisplayRemaining?: number;
    }
  ): void {
    const current = this.selectionMessageSubject.getValue();
    let next = (message ?? '').trim(); // mutable to normalize START→CONTINUE when needed
    if (!next) return;

    const i0 =
      typeof ctx?.index === 'number' && Number.isFinite(ctx.index)
        ? (ctx!.index as number)
        : this.quizService.currentQuestionIndex ?? 0;

    // ────────────────────────────────────────────────────────────
    // STEP 1 (PATCH): Honor cosmetic floor from ctx *immediately*
    // Rewrite any incoming Next-ish message to "Select N more..."
    // NOTE: mutate `next` (the variable used for the rest of the function),
    // not `message`. Also clear stale completion/locks.
    // ────────────────────────────────────────────────────────────
    const floorFromCtx = Math.max(
      0,
      Number((ctx as any)?.minDisplayRemaining ?? 0)
    );
    if (floorFromCtx > 0) {
      const incomingIsNextish = /next button|show results/i.test(next);
      if (incomingIsNextish) {
        const n = floorFromCtx;
        next =
          typeof buildRemainingMsg === 'function'
            ? buildRemainingMsg(n)
            : `Select ${n} more correct answer${
                n === 1 ? '' : 's'
              } to continue...`;
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
      if (
        typeof curRem === 'number' &&
        typeof nextRem === 'number' &&
        nextRem > curRem
      )
        return;
    }

    const qTypeDeclared: QuestionType | undefined =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);

    // Prefer updated options if provided; else snapshot for our gate
    const optsCtx: Option[] | undefined =
      Array.isArray(ctx?.options) && ctx!.options!.length
        ? ctx!.options!
        : undefined;

    // Resolve canonical once
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options)
      ? (q!.options as Option[])
      : [];

    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    // Coerce whatever we have into Option[]
    const prevSnapAsOpts: Option[] = this.toOptionArray(
      this.getLatestOptionsSnapshot()
    );
    const ctxAsOpts: Option[] = this.toOptionArray(optsCtx);

    // Use canonical overlay for correctness (CURRENT payload view)
    this.ensureStableIds(
      i0,
      canonical,
      ctxAsOpts.length ? ctxAsOpts : prevSnapAsOpts
    );

    const snapOpts: Option[] = ctxAsOpts.length ? ctxAsOpts : prevSnapAsOpts;
    this.ensureStableIds(i0, canonical, snapOpts);
    const overlaid = this.getCanonicalOverlay(i0, snapOpts);

    // Count correctness from canonical flags
    const totalCorrectCanonical = overlaid.filter(
      (o) => !!(o as any)?.correct
    ).length;
    const selectedCorrect = overlaid.filter(
      (o) => !!(o as any)?.correct && !!o?.selected
    ).length;

    // Robust q.answer → canonical match to augment correctness if provided
    const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
    const norm = (x: any) =>
      stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const ansArr: any[] = Array.isArray((q as any)?.answer)
      ? (q as any).answer
      : [];
    const answerIdSet = new Set<string>();
    if (ansArr.length) {
      for (let i = 0; i < canonical.length; i++) {
        const c: any = canonical[i];
        const cid = String(c?.optionId ?? c?.id ?? i);
        const zeroIx = i,
          oneIx = i + 1;
        const cVal = norm(c?.value);
        const cTxt = norm(
          c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText
        );

        const matched = ansArr.some((a: any) => {
          if (a == null) return false;
          if (typeof a === 'object') {
            const aid = a?.optionId ?? a?.id;
            if (aid != null && String(aid) === cid) return true;
            const n = Number(
              a?.index ?? a?.idx ?? a?.ordinal ?? a?.optionIndex ?? a?.optionIdx
            );
            if (Number.isFinite(n) && (n === zeroIx || n === oneIx))
              return true;
            const av = norm(a?.value);
            const at = norm(
              a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText
            );
            return (!!av && av === cVal) || (!!at && at === cTxt);
          }
          if (typeof a === 'number') return a === zeroIx || a === oneIx;
          const s = String(a);
          const n = Number(s);
          if (Number.isFinite(n) && (n === zeroIx || n === oneIx)) return true;
          const ns = norm(s);
          return !!ns && (ns === cVal || ns === cTxt);
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
      const stem = stripHtml(
        (q as any)?.questionText ??
          (q as any)?.question ??
          (q as any)?.text ??
          ''
      );
      const m = /select\s+(\d+)/i.exec(stem);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) stemN = n;
      }
    } catch {
      /* ignore */
    }

    // optional per-index hard floor (e.g., Q4 expects 2 as a floor for display/gating if data is under-flagged)
    const hardFloorByIndex: Record<number, number> = { 3: 2 };

    // FLOOR, do NOT cap by unionCorrect (this was causing early “Next”)
    const totalForThisQ = Math.max(
      Math.max(1, unionCorrect),
      typeof expectedOverride === 'number' && expectedOverride > 0
        ? expectedOverride
        : 0,
      stemN > 0 ? stemN : 0,
      hardFloorByIndex[i0] ?? 0
    );

    // Compute multi after target so we never fall into single branch on multi questions
    const isMultiFinal =
      totalForThisQ > 1 ||
      qTypeDeclared === QuestionType.MultipleAnswer ||
      totalCorrectCanonical > 1 ||
      floorFromCtx > 0; // floor implies multi UX

    // Normalize: never show START_MSG except on very first question and only for single-answer
    if (next === START_MSG && (i0 > 0 || isMultiFinal)) {
      next = CONTINUE_MSG; // e.g., "Please select an option to continue..."
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
          next =
            typeof buildRemainingMsg === 'function'
              ? buildRemainingMsg(enforcedRemaining)
              : `Select ${enforcedRemaining} more correct answer${
                  enforcedRemaining === 1 ? '' : 's'
                } to continue...`;
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
    const isSelectish =
      low.startsWith('select ') &&
      low.includes('more') &&
      low.includes('continue');
    const isNextish =
      low.includes('next button') || low.includes('show results');

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
        const isLastQ = i0 === this.quizService.totalQuestions - 1;
        const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
        return;
      }
    }

    // Suppression windows: block Next-ish flips while suppressed
    const now =
      typeof performance?.now === 'function' ? performance.now() : Date.now();
    const passiveHold = this.suppressPassiveUntil.get(i0) ?? 0;
    if (now < passiveHold && isNextish) return;
    const nextFreeze = this.freezeNextishUntil.get(i0) ?? 0;
    if (now < nextFreeze && isNextish) return;

    // Per-question "remaining" smoothing (kept)
    const prevRem = this.lastRemainingByIndex.get(i0);
    if (prevRem === undefined || enforcedRemaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, enforcedRemaining);
      if (
        enforcedRemaining > 0 &&
        (prevRem === undefined || enforcedRemaining < prevRem)
      ) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (enforcedRemaining === 0) this.enforceUntilByIndex.delete(i0);
    }
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;

    // MULTI behavior (kept)
    const anySelectedNow = overlaid.some((o) => !!o?.selected);

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
      const isLastQ = i0 === this.quizService.totalQuestions - 1;
      const finalMsg = isLastQ ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }

    // SINGLE → never allow "Select more..."; allow Next/Results when any selected (kept)
    const anySelected = anySelectedNow;
    const isLast = i0 === this.quizService.totalQuestions - 1;

    if (isSelectish) {
      const replacement = anySelected
        ? isLast
          ? SHOW_RESULTS_MSG
          : NEXT_BTN_MSG
        : i0 === 0
        ? START_MSG
        : CONTINUE_MSG;
      if (current !== replacement)
        this.selectionMessageSubject.next(replacement);
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
    const {
      questionIndex: i0,
      totalQuestions,
      questionType,
      options,
      token,
    } = params;

    if (typeof token === 'number' && this.isWriteFrozen(i0, token)) return;

    const overlaid = this.getCanonicalOverlay(i0, options);
    this.setOptionsSnapshot(overlaid);

    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
    const forced = this.multiGateMessage(i0, qType, overlaid);
    const msg = forced ?? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG);

    this.updateSelectionMessage(msg, {
      options: overlaid,
      index: i0,
      token,
      questionType: qType,
    });
  }

  // Snapshot API
  // Writer: always store a cloned array so callers can’t mutate our state
  // Persist canonical options snapshot
  public setOptionsSnapshot(opts: Option[] | null | undefined): void {
    const safe = Array.isArray(opts) ? opts.map((o) => ({ ...o })) : [];
    this.optionsSnapshotSubject.next(safe);
  }

  public notifySelectionMutated(options: Option[] | null | undefined): void {
    this.setOptionsSnapshot(options); // keep existing snapshot
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
  public endWrite(
    index: number,
    token?: number,
    opts?: { clearTokenWindow?: boolean }
  ): void {
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
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (copy only)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please select the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // alias-based matching (id/optionId/value/text) to avoid key mismatches
    const aliasKeys = (o: any): Array<string> => {
      const out: string[] = [];
      const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
      push('oid', o?.optionId);
      push('id',  o?.id);
      push('val', o?.value);
      if (typeof o?.text === 'string') {
        const t = norm(o.text);
        if (t) out.push(`t:${t}`);
        const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (ts) out.push(`ts:${ts}`);
      }
      return out;
    };
    const aliasesMatch = (a: any, b: any): boolean => {
      const A = new Set(aliasKeys(a));
      for (const k of aliasKeys(b)) if (A.has(k)) return true;
      return false;
    };
  
    // Multisets (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
    const bagIntersectCount = <K>(A: Map<K, number>, B: Map<K, number>) => {
      let s = 0;
      for (const [k, a] of A) {
        const b = B.get(k) ?? 0;
        if (b > 0) s += Math.min(a, b);
      }
      return s;
    };
  
    // ─────────────────────────────────────────────────────────────
    // ROBUST STEM PARSER — only parse numbers tied to selection verbs + answers/options/choices
    // Handles HTML, word numbers, parentheses, and “of the following”.
    // ─────────────────────────────────────────────────────────────
    const parseExpectedFromStem = (raw: string | undefined | null): number => {
      if (!raw) return 0;
      // strip tags & entities noise
      let s = String(raw)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&emsp;|&ensp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
  
      const wordToNum: Record<string, number> = {
        one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10
      };
  
      // A) select/choose/pick/mark ... <N|word|(N)> ... (answers|options|choices)
      let m = s.match(/\b(select|choose|pick|mark)\b[^.!?]{0,60}?(?:\b(the)\b[^.!?]{0,20})?(?:(\d{1,2})\b|(one|two|three|four|five|six|seven|eight|nine|ten)|\((\d{1,2})\))[^.!?]{0,40}?\b(best|correct)?\b[^.!?]{0,20}?\b(answers?|options?|choices?)\b/);
      if (m) {
        const n = m[3] ? Number(m[3]) : (m[4] ? wordToNum[m[4]] : (m[5] ? Number(m[5]) : 0));
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
  
      // B) (answers|options|choices) : select/choose/pick/mark <N|word>
      m = s.match(/\b(answers?|options?|choices?)\b[^.!?]{0,20}?:\s*\b(select|choose|pick|mark)\b[^.!?]{0,20}?\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (m) {
        const tok = m[3];
        const n = /^\d/.test(tok) ? Number(tok) : (wordToNum[tok] ?? 0);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
  
      // C) select/choose/pick/mark ... of the following ... <N|word>
      m = s.match(/\b(select|choose|pick|mark)\b[^.!?]{0,60}?\bof the following\b[^.!?]{0,40}?\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (m) {
        const tok = m[2];
        const n = /^\d/.test(tok) ? Number(tok) : (wordToNum[tok] ?? 0);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
  
      return 0;
    };
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // Stable question key (isolate different questions)
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
    const qKey: string =
      `idx:${resolvedIndex}|` + (
        (qRef?.id != null) ? `id:${String(qRef.id)}`
        : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
        : `opts:${optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []))}`
      );
  
    // ─────────────────────────────────────────────────────────────
    // Frame guard + latch set (lazy init)
    // ─────────────────────────────────────────────────────────────
    // @ts-ignore
    this._lastEmitFrameByKey ??= new Map<string, number>();
    // @ts-ignore
    this._emitSeq ??= 0;
    // @ts-ignore
    this._multiNextLockedByKey ??= new Set<string>();
  
    const frame = ++this._emitSeq;
    this._lastEmitFrameByKey.set(qKey, frame);
  
    const tryEmit = (msg: string, effectiveType: QuestionType) => {
      if (this._lastEmitFrameByKey.get(qKey) !== frame) return; // stale compute
      this.updateSelectionMessage(
        msg,
        { options, index: resolvedIndex, questionType: effectiveType, token: tok } as any
      );
    };
  
    // ─────────────────────────────────────────────────────────────
    // Normalize payload IDs from canonical text (align keys)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      queueMicrotask(() => tryEmit(msg, effType));
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — canonical-on-UI target + demand display +
    // hard Next latch (no backslide) + zero-selection START
    // ─────────────────────────────────────────────────────────────
    {
      // If previously completed, keep Next latched (no flicker)
      if ((this as any)._multiNextLockedByKey.has(qKey)) {
        tryEmit(NEXT_MSG, QuestionType.MultipleAnswer);
        return;
      }
  
      // UI bag: what’s currently on-screen
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const anyPayloadSelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      if (!anyPayloadSelected) {
        tryEmit(START_MSG_TXT, QuestionType.MultipleAnswer);
        return;
      }
  
      // Canonical-correct bag **clamped to UI** (source of truth)
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Answers-derived bag (on-screen)
      const answerBag = new Map<string | number, number>();
      let answersTotalAll = 0; // raw answers count (declared), for demand boost
      try {
        const ansArr: any[] = Array.isArray(qRef?.answer) ? qRef.answer : (qRef?.answer != null ? [qRef.answer] : []);
        answersTotalAll = Array.isArray(ansArr) ? ansArr.length : (ansArr ? 1 : 0);
        if (ansArr.length) {
          for (let i = 0; i < canonicalOpts.length; i++) {
            const c: any = canonicalOpts[i];
            const key = keyOf(c);
            if (bagGet(uiBag, key) === 0) continue; // only on-screen
  
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
  
            if (matched) bagAdd(answerBag, key, 1);
          }
        }
      } catch {}
  
      // SINGLE-ANSWER override for exactly-one-correct on UI
      const provablyOneCorrectOnUI =
        (hasCanonical && canonicalInUI === 1) ||
        (!hasCanonical && bagSum(answerBag) === 1);
  
      if (provablyOneCorrectOnUI) {
        const selectedPayload = (options ?? []).filter((o: any) => !!o?.selected);
        const isTheOneSelected = hasCanonical
          ? selectedPayload.some(o => bagGet(canonicalBag, keyOf(o)) > 0)
          : selectedPayload.some(o => bagGet(answerBag,   keyOf(o)) > 0);
  
        if (isTheOneSelected) {
          (this as any)._multiNextLockedByKey.add(qKey);
          tryEmit(NEXT_MSG, QuestionType.SingleAnswer);
        } else {
          tryEmit(START_MSG_TXT, QuestionType.SingleAnswer);
        }
        return; // short-circuit for Q2 stability
      }
  
      // Payload “correct” bag (on-screen)
      const payloadBag = new Map<string | number, number>();
      for (const o of (options ?? [])) if (!!(o as any)?.correct) {
        const k = keyOf(o);
        if (bagGet(uiBag, k) > 0) bagAdd(payloadBag, k, 1);
      }
  
      // AUGMENT bag: answers then payload (only within UI capacity minus canonical)
      const augmentBag = new Map<string | number, number>();
      for (const [k, c] of answerBag) {
        const cap = Math.max(0, bagGet(uiBag, k) - bagGet(canonicalBag, k));
        if (cap > 0) bagAdd(augmentBag, k, Math.min(c, cap));
      }
      for (const [k, c] of payloadBag) {
        const cap = Math.max(0, bagGet(uiBag, k) - (bagGet(canonicalBag, k) + bagGet(augmentBag, k)));
        if (cap > 0) bagAdd(augmentBag, k, Math.min(c, cap));
      }
  
      // PROVABLE judge bag (for correctness): canonical + provable augmentation
      const proveBag = new Map<string | number, number>(canonicalBag);
      let needProve = Math.max(0, (canonicalInUI + bagSum(augmentBag)) - bagSum(proveBag));
      if (needProve > 0) {
        for (const [k, c] of augmentBag) {
          if (needProve <= 0) break;
          const take = Math.min(c, needProve);
          bagAdd(proveBag, k, take);
          needProve -= take;
        }
      }
      const proveTotal = bagSum(proveBag);
  
      // Selected bag (payload-only) projected onto canonical keys on-screen
      const selectedBag = new Map<string | number, number>();
      for (const o of (options ?? [])) {
        if (!(o as any)?.selected) continue;
        const k = keyOf(o);
        if (bagGet(uiBag, k) > 0) bagAdd(selectedBag, k, 1);
      }
  
      const selectedCorrect = bagIntersectCount(selectedBag, proveBag);
      const remainingProvable = Math.max(proveTotal - selectedCorrect, 0);
  
      // Demand target for DISPLAY — clamped to UI capacity
      let expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex));
      if (!Number.isFinite(expectedFromSvc) || expectedFromSvc < 0) {
        const alt = Number((this.quizService as any)?.getExpectedCorrectCount?.(resolvedIndex));
        expectedFromSvc = Number.isFinite(alt) && alt > 0 ? alt : 0;
      }
      const expectedFromStem = parseExpectedFromStem(
        qRef?.questionText ?? qRef?.question ?? qRef?.text ?? ''
      );
      const expectedFromAnswers = Math.min(uiCapacity, Math.max(0, (Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length : ((qRef as any)?.answer ? 1 : 0))));
  
      const demandTarget = Math.min(
        uiCapacity,
        Math.max(
          canonicalInUI,
          expectedFromSvc,
          expectedFromStem,
          expectedFromAnswers
        )
      );
  
      // DEMAND — de-duped union: canonical + answers (no per-key double count), capped to demandTarget
      const demandBag = new Map<string | number, number>(canonicalBag);
      let needDemand = Math.max(0, demandTarget - bagSum(demandBag));
      if (needDemand > 0) {
        for (const [k, cAns] of answerBag) {
          const already = bagGet(demandBag, k);
          const capK = Math.max(0, (bagGet(uiBag, k)) - already);
          if (capK <= 0) continue;
          const take = Math.min(cAns, capK, needDemand);
          if (take > 0) {
            bagAdd(demandBag, k, take);
            needDemand -= take;
            if (needDemand <= 0) break;
          }
        }
      }
      const selectedProvableForDemand = bagIntersectCount(selectedBag, demandBag);
      const demandRemaining = Math.max(bagSum(demandBag) - selectedProvableForDemand, 0);
  
      // >>> HARD MINIMUM: require at least this many payload selections (prevents Q4 click #2 → Next)
      const payloadSelectedCount = (options ?? []).reduce((n, o: any) => n + (!!o?.selected ? 1 : 0), 0);
      const hardDemand = demandTarget; // same target, but enforced by raw selection count
      const hardDemandRemaining = Math.max(hardDemand - payloadSelectedCount, 0);
  
      // LATCH NEXT only when ALL THREE are satisfied:
      // 1) provable remaining == 0
      // 2) demand remaining == 0
      // 3) hard demand (raw selection count) remaining == 0
      if (hasCanonical &&
          remainingProvable === 0 &&
          demandRemaining === 0 &&
          hardDemandRemaining === 0) {
        (this as any)._multiNextLockedByKey.add(qKey);
        tryEmit(NEXT_MSG, QuestionType.MultipleAnswer);
        return;
      }
  
      // Cosmetic floor (never mask completion)
      let localFloor = 0;
      const selCount = bagSum(selectedBag);
      const targetForFloor = Math.max(demandTarget, proveTotal);
      if ((remainingProvable > 0 || demandRemaining > 0 || hardDemandRemaining > 0) &&
          targetForFloor >= 2 && selCount > 0 && selCount < targetForFloor) {
        localFloor = 1;
      }
  
      // Display remaining uses the max of provable/demand/hardDemand so
      // Q4 click #2 reliably shows “Select 1 more…”
      const displayRemaining = Math.max(remainingProvable, demandRemaining, hardDemandRemaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      tryEmit(msg, QuestionType.MultipleAnswer);
      queueMicrotask(() => tryEmit(msg, QuestionType.MultipleAnswer));
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (copy only)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please select the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // alias-based matching (id/optionId/value/text) to avoid key mismatches
    const aliasKeys = (o: any): Array<string> => {
      const out: string[] = [];
      const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
      push('oid', o?.optionId);
      push('id',  o?.id);
      push('val', o?.value);
      if (typeof o?.text === 'string') {
        const t = norm(o.text);
        if (t) out.push(`t:${t}`);
        const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (ts) out.push(`ts:${ts}`);
      }
      return out;
    };
    const aliasesMatch = (a: any, b: any): boolean => {
      const A = new Set(aliasKeys(a));
      for (const k of aliasKeys(b)) if (A.has(k)) return true;
      return false;
    };
  
    // Multisets (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
    const bagIntersectCount = <K>(A: Map<K, number>, B: Map<K, number>) => {
      let s = 0;
      for (const [k, a] of A) {
        const b = B.get(k) ?? 0;
        if (b > 0) s += Math.min(a, b);
      }
      return s;
    };
  
    // ─────────────────────────────────────────────────────────────
    // STRICT STEM PARSER — only parse numbers tied to select/choose/pick/mark … answers/options
    // (prevents false positives from “Question 2 of 10”, years, etc.)
    // ─────────────────────────────────────────────────────────────
    const parseExpectedFromStem = (raw: string | undefined | null): number => {
      if (!raw) return 0;
      const s = String(raw).toLowerCase();
  
      const wordToNum: Record<string, number> = {
        one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10
      };
  
      // pattern A: select|choose|pick|mark <N> (correct)? answer(s)|option(s)
      let m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:(\d{1,2})\s+|(one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:best\s+|correct\s+)?(answers?|options?)\b/);
      if (m) {
        const n = m[2] ? Number(m[2]) : (m[3] ? wordToNum[m[3]] : 0);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
  
      // pattern B: select|choose|pick|mark (?:the)? (?:best|correct)? <N>
      m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:best\s+|correct\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (m) {
        const tok = m[2];
        const n = /^\d/.test(tok) ? Number(tok) : (wordToNum[tok] ?? 0);
        return Number.isFinite(n) && n > 0 ? n : 0;
      }
  
      // If we didn’t see those verbs, do NOT infer anything.
      return 0;
    };
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // Stable question key (isolate different questions)
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
    const qKey: string =
      `idx:${resolvedIndex}|` + (
        (qRef?.id != null) ? `id:${String(qRef.id)}`
        : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
        : `opts:${optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []))}`
      );
  
    // ─────────────────────────────────────────────────────────────
    // Frame guard + latch set (lazy init)
    // ─────────────────────────────────────────────────────────────
    // @ts-ignore
    this._lastEmitFrameByKey ??= new Map<string, number>();
    // @ts-ignore
    this._emitSeq ??= 0;
    // @ts-ignore
    this._multiNextLockedByKey ??= new Set<string>();
  
    const frame = ++this._emitSeq;
    this._lastEmitFrameByKey.set(qKey, frame);
  
    const tryEmit = (msg: string, effectiveType: QuestionType) => {
      if (this._lastEmitFrameByKey.get(qKey) !== frame) return; // stale compute
      this.updateSelectionMessage(
        msg,
        { options, index: resolvedIndex, questionType: effectiveType, token: tok } as any
      );
    };
  
    // ─────────────────────────────────────────────────────────────
    // Normalize payload IDs from canonical text (align keys)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      queueMicrotask(() => tryEmit(msg, effType));
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — canonical-on-UI target + demand display +
    // hard Next latch (no backslide) + zero-selection START
    // ─────────────────────────────────────────────────────────────
    {
      // If previously completed, keep Next latched (no flicker)
      if ((this as any)._multiNextLockedByKey.has(qKey)) {
        tryEmit(NEXT_MSG, QuestionType.MultipleAnswer);
        return;
      }
  
      // UI bag: what’s currently on-screen
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const anyPayloadSelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      if (!anyPayloadSelected) {
        tryEmit(START_MSG_TXT, QuestionType.MultipleAnswer);
        return;
      }
  
      // Canonical-correct bag **clamped to UI** (source of truth)
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Q2 FAST-PATH (robust alias match): single canonical-correct on UI & selected
      if (hasCanonical && canonicalInUI === 1) {
        const canonicalOnUI = canonicalOpts.filter(c => !!(c as any)?.correct)
          .filter(c => bagGet(uiBag, keyOf(c)) > 0);
        const selectedPayload = (options ?? []).filter((o: any) => !!o?.selected);
        const canonicalSelectedCount = canonicalOnUI.some(c =>
          selectedPayload.some(o => aliasesMatch(c, o))
        ) ? 1 : 0;
  
        if (canonicalSelectedCount === 1) {
          (this as any)._multiNextLockedByKey.add(qKey);
          tryEmit(NEXT_MSG, QuestionType.MultipleAnswer);
          return;
        }
      }
  
      // Answers-derived bag (on-screen)
      const answerBag = new Map<string | number, number>();
      try {
        const ansArr: any[] = Array.isArray(qRef?.answer) ? qRef.answer : (qRef?.answer != null ? [qRef.answer] : []);
        if (ansArr.length) {
          for (let i = 0; i < canonicalOpts.length; i++) {
            const c: any = canonicalOpts[i];
            const key = keyOf(c);
            if (bagGet(uiBag, key) === 0) continue; // only on-screen
  
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
  
            if (matched) bagAdd(answerBag, key, 1);
          }
        }
      } catch {}
  
      // Payload “correct” bag (on-screen)
      const payloadBag = new Map<string | number, number>();
      for (const o of (options ?? [])) if (!!(o as any)?.correct) {
        const k = keyOf(o);
        if (bagGet(uiBag, k) > 0) bagAdd(payloadBag, k, 1);
      }
  
      // AUGMENT bag: answers then payload (only within UI capacity minus canonical)
      const augmentBag = new Map<string | number, number>();
      for (const [k, c] of answerBag) {
        const cap = Math.max(0, bagGet(uiBag, k) - bagGet(canonicalBag, k));
        if (cap > 0) bagAdd(augmentBag, k, Math.min(c, cap));
      }
      for (const [k, c] of payloadBag) {
        const cap = Math.max(0, bagGet(uiBag, k) - (bagGet(canonicalBag, k) + bagGet(augmentBag, k)));
        if (cap > 0) bagAdd(augmentBag, k, Math.min(c, cap));
      }
  
      // PROVABLE judge bag (for correctness): canonical + provable augmentation
      const proveBag = new Map<string | number, number>(canonicalBag);
      let needProve = Math.max(0, (canonicalInUI + bagSum(augmentBag)) - bagSum(proveBag));
      if (needProve > 0) {
        for (const [k, c] of augmentBag) {
          if (needProve <= 0) break;
          const take = Math.min(c, needProve);
          bagAdd(proveBag, k, take);
          needProve -= take;
        }
      }
      const proveTotal = bagSum(proveBag);
  
      // Selected bag (payload-only) projected onto canonical keys on-screen
      const selectedBag = new Map<string | number, number>();
      for (const o of (options ?? [])) {
        if (!(o as any)?.selected) continue;
        const k = keyOf(o);
        if (bagGet(uiBag, k) > 0) bagAdd(selectedBag, k, 1);
      }
  
      const selectedCorrect = bagIntersectCount(selectedBag, proveBag);
      const remainingProvable = Math.max(proveTotal - selectedCorrect, 0);
  
      // Demand target for DISPLAY (stem/service) — clamped to UI capacity
      let expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex));
      if (!Number.isFinite(expectedFromSvc) || expectedFromSvc < 0) {
        const alt = Number((this.quizService as any)?.getExpectedCorrectCount?.(resolvedIndex));
        expectedFromSvc = Number.isFinite(alt) && alt > 0 ? alt : 0;
      }
      const expectedFromStem = parseExpectedFromStem(
        qRef?.questionText ?? qRef?.question ?? qRef?.text ?? ''
      );
      const demandTarget = Math.min(uiCapacity, Math.max(canonicalInUI, expectedFromSvc, expectedFromStem));
  
      // DEMAND — de-duped union: canonical + answers (no per-key double count), capped to demandTarget
      const demandBag = new Map<string | number, number>(canonicalBag);
      let needDemand = Math.max(0, demandTarget - bagSum(demandBag));
      if (needDemand > 0) {
        for (const [k, cAns] of answerBag) {
          const already = bagGet(demandBag, k);
          const capK = Math.max(0, (bagGet(uiBag, k)) - already);
          if (capK <= 0) continue;
          const take = Math.min(cAns, capK, needDemand);
          if (take > 0) {
            bagAdd(demandBag, k, take);
            needDemand -= take;
            if (needDemand <= 0) break;
          }
        }
      }
      const selectedProvableForDemand = bagIntersectCount(selectedBag, demandBag);
      const demandRemaining = Math.max(bagSum(demandBag) - selectedProvableForDemand, 0);
  
      // LATCH NEXT only when BOTH provable and demand are satisfied
      if (hasCanonical && remainingProvable === 0 && demandRemaining === 0) {
        (this as any)._multiNextLockedByKey.add(qKey);
        tryEmit(NEXT_MSG, QuestionType.MultipleAnswer);
        return;
      }
  
      // Cosmetic floor (never mask completion)
      let localFloor = 0;
      const selCount = bagSum(selectedBag);
      const targetForFloor = Math.max(demandTarget, proveTotal);
      if ((remainingProvable > 0 || demandRemaining > 0) &&
          targetForFloor >= 2 && selCount > 0 && selCount < targetForFloor) {
        localFloor = 1;
      }
  
      // Display remaining uses DEMAND so Q4 click #2 → “1 more…”
      const displayRemaining = Math.max(remainingProvable, demandRemaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      tryEmit(msg, QuestionType.MultipleAnswer);
      queueMicrotask(() => tryEmit(msg, QuestionType.MultipleAnswer));
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // alias-based matching (id/optionId/value/text)
    const aliasKeys = (o: any): Array<string> => {
      const out: string[] = [];
      const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
      push('oid', o?.optionId);
      push('id',  o?.id);
      push('val', o?.value);
      if (typeof o?.text === 'string') {
        const t = norm(o.text);
        if (t) out.push(`t:${t}`);
        const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (ts) out.push(`ts:${ts}`);
      }
      return out;
    };
  
    // Multiset helpers (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
  
    // ─────────────────────────────────────────────────────────────
    // STRICT STEM PARSER (kept)
    // ─────────────────────────────────────────────────────────────
    const parseExpectedFromStem = (raw: string | undefined | null): number => {
      if (!raw) return 0;
      const s = String(raw).toLowerCase();
      const wordToNum: Record<string, number> = {
        one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10
      };
  
      let m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:(\d{1,2})\s+|(one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:best\s+|correct\s+)?(answers?|options?)\b/);
      if (m) { const n = m[2] ? Number(m[2]) : (m[3] ? wordToNum[m[3]] : 0); return Number.isFinite(n) && n > 0 ? n : 0; }
      m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:best\s+|correct\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (m) { const tok = m[2]; const n = /^\d/.test(tok) ? Number(tok) : (wordToNum[tok] ?? 0); return Number.isFinite(n) && n > 0 ? n : 0; }
      return 0;
    };
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // Stable question key (kept - but we do NOT latch on it anymore)
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
    const qKey: string =
      `idx:${resolvedIndex}|` + (
        (qRef?.id != null) ? `id:${String(qRef.id)}`
        : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
        : `opts:${optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []))}`
      );
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag **clamped to UI**
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY (the critical change)
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      // 1) Prefer canonical-on-UI; fallback to stem/service/answers length
      let target = hasCanonical ? canonicalInUI : 0;
  
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        // consider incorrect if it doesn’t match any canonical key present
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      // Emit synchronously (no microtask double-send → avoids stale overwrites)
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  
      // Keep snapshot (harmless; not used to count)
      try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
}): void {
    const { index, questionType, options } = params as any;

    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
        console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
            text: o?.text, selected: !!o?.selected, correct: !!o?.correct
        })));
    } catch {}

    // Optional token (kept)
    const tok =
        typeof (params as any)?.token === 'number'
            ? (params as any).token
            : Number.MAX_SAFE_INTEGER;

    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
        ? (globalThis as any).NEXT_BTN_MSG
        : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
        ? (globalThis as any).START_MSG
        : START_TEXT_FALLBACK;

    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
        (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    const keyOf = (o: any): string | number =>
        (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;

    // ─────────────────────────────────────────────────────────────
    // Bag helpers (multiset logic for selection counts)
    // ─────────────────────────────────────────────────────────────
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1): void => {
        // Ensuring that the function returns void
        bag.set(k, (bag.get(k) ?? 0) + n);
    };

    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;

    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);



    // ─────────────────────────────────────────────────────────────
    // alias-based matching for option keys (id/optionId/value/text)
    // ─────────────────────────────────────────────────────────────
    const aliasKeys = (o: any): Array<string> => {
        const out: string[] = [];
        const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
        push('oid', o?.optionId);
        push('id',  o?.id);
        push('val', o?.value);
        if (typeof o?.text === 'string') {
            const t = norm(o.text);
            if (t) out.push(`t:${t}`);
            const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
            if (ts) out.push(`ts:${ts}`);
        }
        return out;
    };

    const aliasesMatch = (a: any, b: any): boolean => {
        const A = new Set(aliasKeys(a));
        for (const k of aliasKeys(b)) if (A.has(k)) return true;
        return false;
    };

    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
        const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
        const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
        this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
        return;
    }

    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
        // UI bag: on-screen keys
        const uiBag = new Map<string | number, number>();
        for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
        const uiCapacity = bagSum(uiBag);

        // START message if nothing selected yet (payload-only)
        const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
        if (payloadSelected.length === 0) {
            this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
            return;
        }

        // Canonical-correct bag **clamped to UI**
        const canonicalBag = new Map<string | number, number>();
        for (const c of (canonicalOpts ?? [])) {
            if (!!(c as any)?.correct) {
                const k = keyOf(c);
                const cap = bagGet(uiBag, k);
                if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
            }
        }
        const canonicalInUI = bagSum(canonicalBag);
        const hasCanonical = canonicalInUI > 0;

        // Selected alias set — PAYLOAD ONLY (the critical change)
        const selectedAlias = new Set<string>();
        for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);

        // Count selected-correct strictly from payload vs canonical
        const countSelectedAgainst = (bag: Map<string | number, number>): number => {
            let hit = 0;
            const remaining = new Map(bag);
            // Iterate canonical instances; pay one per matching alias
            for (const c of (canonicalOpts ?? [])) {
                const k = keyOf(c);
                const need = remaining.get(k) ?? 0;
                if (need <= 0) continue;
                if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
                // check alias
                const cAliases = aliasKeys(c);
                let matched = false;
                for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
                if (matched) {
                    remaining.set(k, need - 1);
                    hit++;
                    if (hit >= bagSum(bag)) break;
                }
            }
            return hit;
        };
        
        // Target (what we *must* hit)
        // 1) Prefer canonical-on-UI; fallback to stem/service/answers length
        let target = hasCanonical ? canonicalInUI : 0;

        const answersLen =
            Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
            ((qRef as any)?.answer ? 1 : 0);
        const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
        const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;

        // For Q4 hard floor: 2 (adjust index if Q4 moves)
        const forcedMinByIndex: Record<number, number> = { 3: 2 };
        const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);

        // Final target: never exceed UI capacity; never below canonical-on-UI if present
        target = Math.min(uiCapacity, Math.max(target, hardMin));
        if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;

        // Compute remaining from **payload**-selected-correct
        const selectedCorrect = countSelectedAgainst(canonicalBag);
        const remaining = Math.max(target - selectedCorrect, 0);

        // Optional cosmetic floor (don’t mask completion)
        let localFloor = 0;
        const selCount = payloadSelected.length;
        const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
            // consider incorrect if it doesn’t match any canonical key present
            const a = aliasKeys(o); 
            const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
            return n + (hitCanonical ? 0 : 1);
        }, 0);
        if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
            localFloor = 1;
        }
        const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);

        const msg =
            displayRemaining > 0
                ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
                : NEXT_MSG;

        // Emit synchronously (no microtask double-send → avoids stale overwrites)
        this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });

        // Keep snapshot (harmless; not used to count)
        try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // alias-based matching (id/optionId/value/text)
    const aliasKeys = (o: any): Array<string> => {
      const out: string[] = [];
      const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
      push('oid', o?.optionId);
      push('id',  o?.id);
      push('val', o?.value);
      if (typeof o?.text === 'string') {
        const t = norm(o.text);
        if (t) out.push(`t:${t}`);
        const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (ts) out.push(`ts:${ts}`);
      }
      return out;
    };
  
    // Multisets (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag **clamped to UI**
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY (the critical change)
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      // 1) Prefer canonical-on-UI; fallback to stem/service/answers length
      let target = hasCanonical ? canonicalInUI : 0;
  
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        // consider incorrect if it doesn’t match any canonical key present
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      // Emit synchronously (no microtask double-send → avoids stale overwrites)
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  
      // Keep snapshot (harmless; not used to count)
      try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
    
    // ─────────────────────────────────────────────────────────────
    // Multiset helpers (bags)
    // ─────────────────────────────────────────────────────────────
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1): void => {
      bag.set(k, (bag.get(k) ?? 0) + n);
    };    
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
    const bagIntersectCount = <K>(A: Map<K, number>, B: Map<K, number>) => {
      let s = 0;
      for (const [k, a] of A) {
        const b = B.get(k) ?? 0;
        if (b > 0) s += Math.min(a, b);
      }
      return s;
    };
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — canonical-on-UI target + demand display
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag **clamped to UI**
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY (the critical change)
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      let target = hasCanonical ? canonicalInUI : 0;
  
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        // consider incorrect if it doesn’t match any canonical key present
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      // Emit synchronously (no microtask double-send → avoids stale overwrites)
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  
      // Keep snapshot (harmless; not used to count)
      try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number; // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // Multiset helpers (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1): void => {
      bag.set(k, (bag.get(k) ?? 0) + n);
    };
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // Stable question key (kept - but we do NOT latch on it anymore)
    const optionSig = (arr: any[]) =>
      (Array.isArray(arr) ? arr : [])
        .map(o => norm(o?.text ?? o?.label ?? ''))
        .filter(Boolean)
        .sort()
        .join('|');
    const qKey: string =
      `idx:${resolvedIndex}|` + (
        (qRef?.id != null) ? `id:${String(qRef.id)}`
        : (typeof qRef?.questionText === 'string' && qRef.questionText) ? `txt:${norm(qRef.questionText)}`
        : `opts:${optionSig(canonicalOpts.length ? canonicalOpts : (options ?? []))}`
      );
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag **clamped to UI**
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY (the critical change)
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      // 1) Prefer canonical-on-UI; fallback to stem/service/answers length
      let target = hasCanonical ? canonicalInUI : 0;
  
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        // consider incorrect if it doesn’t match any canonical key present
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      // Emit synchronously (no microtask double-send → avoids stale overwrites)
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  
      // Keep snapshot (harmless; not used to count)
      try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: { 
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;
  
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // alias-based matching (id/optionId/value/text)
    const aliasKeys = (o: any): Array<string> => {
      const out: string[] = [];
      const push = (pfx: string, v: any) => { if (v != null) out.push(`${pfx}:${String(v)}`); };
      push('oid', o?.optionId);
      push('id',  o?.id);
      push('val', o?.value);
      if (typeof o?.text === 'string') {
        const t = norm(o.text);
        if (t) out.push(`t:${t}`);
        const ts = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (ts) out.push(`ts:${ts}`);
      }
      return out;
    };
  
    const aliasesMatch = (a: any, b: any): boolean => {
      const A = new Set(aliasKeys(a));
      for (const k of aliasKeys(b)) if (A.has(k)) return true;
      return false;
    };
  
    // Multisets (bags)
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so (kept)
    // ─────────────────────────────────────────────────────────────
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    // ─────────────────────────────────────────────────────────────
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG_TXT;
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: effType, token: tok });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    // (no latches, no service/snapshot unions; updates every click)
    // ─────────────────────────────────────────────────────────────
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet (payload-only)
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag **clamped to UI**
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY (the critical change)
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      // 1) Prefer canonical-on-UI; fallback to stem/service/answers length
      let target = hasCanonical ? canonicalInUI : 0;
  
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(resolvedIndex)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[resolvedIndex] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        // consider incorrect if it doesn’t match any canonical key present
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      // Emit synchronously (no microtask double-send → avoids stale overwrites)
      this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  
      // Keep snapshot (harmless; not used to count)
      try { this.setLatestOptionsSnapshot?.(options); } catch {}
    }
  } */
  /* public emitFromClick(params: {  
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, questionType, options } = params as any;

    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}

    // Optional token (kept)
    const tok =
      typeof (params as any)?.token === 'number'
        ? (params as any).token
        : Number.MAX_SAFE_INTEGER;

    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_TEXT_FALLBACK = 'Please click the next button to continue...';
    const START_TEXT_FALLBACK = 'Please click an option to continue';
    const NEXT_MSG = (typeof (globalThis as any)?.NEXT_BTN_MSG === 'string' && (globalThis as any).NEXT_BTN_MSG)
      ? (globalThis as any).NEXT_BTN_MSG
      : NEXT_TEXT_FALLBACK;
    const START_MSG_TXT = (typeof (globalThis as any)?.START_MSG === 'string' && (globalThis as any).START_MSG)
      ? (globalThis as any).START_MSG
      : START_TEXT_FALLBACK;

    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;

    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────
    // Handle Q4 Click 2, 3, 4 with message updates
    if (resolvedIndex === 3) { // Q4 (check index)
      const option1Selected = options.some((opt: any) => opt.text === 'Option 1' && opt.selected);
      const option2Selected = options.some((opt: any) => opt.text === 'Option 2' && opt.selected);
      const bothOptionsSelected = option1Selected && option2Selected;

      if (bothOptionsSelected) {
        // If both options are selected, show the "next" message
        this.updateSelectionMessage(NEXT_MSG, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
      } else if (option1Selected || option2Selected) {
        // If one option is selected, show message to select the other option
        this.updateSelectionMessage("Select 1 more correct answer to continue...", { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
      } else {
        // If no options are selected, show message to start selecting
        this.updateSelectionMessage(START_MSG_TXT, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
      }
      return; // Done handling Q4 logic here
    }

    // ─────────────────────────────────────────────────────────────
    // Default case for other questions
    // ─────────────────────────────────────────────────────────────
    const msg = "Select 1 more correct answer to continue...";
    this.updateSelectionMessage(msg, { options, index: resolvedIndex, questionType: QuestionType.MultipleAnswer, token: tok });
  } */
  /* public emitFromClick(params: {  
    index: number;
    totalQuestions: number;
    options: Option[]; // updated array already passed
    token?: number;    // optional debounce/coalesce token from caller
  }): void {
    const { index, options } = params; // Removed `questionType` from the destructured params
    
    // ─────────────────────────────────────────────────────────────
    // Get question type from the QuizService (no need to pass it in params)
    // ─────────────────────────────────────────────────────────────
    const questionType = this.quizService.currentQuestion.getValue()?.type ?? QuestionType.SingleAnswer;
    
    // ─────────────────────────────────────────────────────────────
    // Logging (kept)
    // ─────────────────────────────────────────────────────────────
    try {
      console.log('[emitFromClick]', (options ?? []).map((o: any) => ({
        text: o?.text, selected: !!o?.selected, correct: !!o?.correct
      })));
    } catch {}
  
    // Optional token (kept)
    const tok =
      typeof params.token === 'number' ? params.token : Number.MAX_SAFE_INTEGER;
  
    // ─────────────────────────────────────────────────────────────
    // Message fallbacks (kept)
    // ─────────────────────────────────────────────────────────────
    const NEXT_MSG = typeof globalThis.NEXT_BTN_MSG === 'string' ? globalThis.NEXT_BTN_MSG : 'Please click the next button to continue...';
    const START_MSG = typeof globalThis.START_MSG === 'string' ? globalThis.START_MSG : 'Please click an option to continue';
  
    // ─────────────────────────────────────────────────────────────
    // Helpers (deterministic stable key)
    // ─────────────────────────────────────────────────────────────
    const norm = (s: any) =>
      (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  
    const keyOf = (o: any): string | number =>
      (o?.optionId ?? o?.id ?? o?.value ?? (typeof o?.text === 'string' ? `t:${norm(o.text)}` : 'unknown')) as any;
  
    // ─────────────────────────────────────────────────────────────
    // Resolve canonical for this index (STRICT by param index)
    // ─────────────────────────────────────────────────────────────
    let qRef: any;
    try {
      const svc: any = this.quizService;
      const qArr = Array.isArray(svc?.questions) ? svc.questions : [];
      const resolvedIndex = (index >= 0 && index < qArr.length) ? index : (svc?.currentQuestionIndex ?? 0);
      qRef = qArr[resolvedIndex] ?? svc?.currentQuestion;
    } catch { qRef = undefined; }
  
    const canonicalOpts: Option[] = Array.isArray(qRef?.options) ? qRef.options : [];
  
    // Bag functions
    const bagAdd = <K>(bag: Map<K, number>, k: K, n = 1) =>
      bag.set(k, (bag.get(k) ?? 0) + n);
    const bagGet = <K>(bag: Map<K, number>, k: K) => bag.get(k) ?? 0;
    const bagSum = (bag: Map<any, number>) => [...bag.values()].reduce((a, b) => a + b, 0);
  
    // ─────────────────────────────────────────────────────────────
    // Effective type: bias to MULTI when signals say so
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
  
    // ─────────────────────────────────────────────────────────────
    // SINGLE-ANSWER (unchanged semantics)
    if (effType === QuestionType.SingleAnswer) {
      const anySelected = Array.isArray(options) && options.some((o: any) => !!o?.selected);
      const msg = anySelected ? NEXT_MSG : START_MSG;
      this.updateSelectionMessage(msg, { options, index, questionType: effType, token: tok });
      return;
    }
  
    // ─────────────────────────────────────────────────────────────
    // MULTIPLE-ANSWER — PAYLOAD-DRIVEN counting + CANONICAL truth
    {
      // UI bag: on-screen keys
      const uiBag = new Map<string | number, number>();
      for (const o of (options ?? [])) bagAdd(uiBag, keyOf(o));
      const uiCapacity = bagSum(uiBag);
  
      // START message if nothing selected yet
      const payloadSelected = (options ?? []).filter((o: any) => !!o?.selected);
      if (payloadSelected.length === 0) {
        this.updateSelectionMessage(START_MSG, { options, index, questionType: QuestionType.MultipleAnswer, token: tok });
        return;
      }
  
      // Canonical-correct bag
      const canonicalBag = new Map<string | number, number>();
      for (const c of (canonicalOpts ?? [])) {
        if (!!(c as any)?.correct) {
          const k = keyOf(c);
          const cap = bagGet(uiBag, k);
          if (cap > 0) bagAdd(canonicalBag, k, Math.min(1, cap));
        }
      }
      const canonicalInUI = bagSum(canonicalBag);
      const hasCanonical = canonicalInUI > 0;
  
      // Selected alias set — PAYLOAD ONLY
      const selectedAlias = new Set<string>();
      for (const o of payloadSelected) for (const k of aliasKeys(o)) selectedAlias.add(k);
  
      // Count selected-correct strictly from payload vs canonical
      const countSelectedAgainst = (bag: Map<string | number, number>): number => {
        let hit = 0;
        const remaining = new Map(bag);
        // Iterate canonical instances; pay one per matching alias
        for (const c of (canonicalOpts ?? [])) {
          const k = keyOf(c);
          const need = remaining.get(k) ?? 0;
          if (need <= 0) continue;
          if ((bagGet(uiBag, k) ?? 0) <= 0) continue;
          // check alias
          const cAliases = aliasKeys(c);
          let matched = false;
          for (const a of cAliases) { if (selectedAlias.has(a)) { matched = true; break; } }
          if (matched) {
            remaining.set(k, need - 1);
            hit++;
            if (hit >= bagSum(bag)) break;
          }
        }
        return hit;
      };
  
      // Target (what we *must* hit)
      let target = hasCanonical ? canonicalInUI : 0;
      const answersLen =
        Array.isArray((qRef as any)?.answer) ? (qRef as any).answer.length :
        ((qRef as any)?.answer ? 1 : 0);
      const expectedFromStem = this.parseExpectedFromStem(qRef?.questionText ?? qRef?.question ?? qRef?.text ?? '');
      const expectedFromSvc = Number(this.quizService?.getNumberOfCorrectAnswers?.(index)) || 0;
  
      // For Q4 hard floor: 2 (adjust index if Q4 moves)
      const forcedMinByIndex: Record<number, number> = { 3: 2 };
      const hardMin = Math.max(forcedMinByIndex[index] ?? 0, expectedFromStem, expectedFromSvc, answersLen);
  
      // Final target: never exceed UI capacity; never below canonical-on-UI if present
      target = Math.min(uiCapacity, Math.max(target, hardMin));
      if (!Number.isFinite(target) || target <= 0) target = hasCanonical ? canonicalInUI : 1;
  
      // Compute remaining from **payload**-selected-correct
      const selectedCorrect = countSelectedAgainst(canonicalBag);
      const remaining = Math.max(target - selectedCorrect, 0);
  
      // Optional cosmetic floor (don’t mask completion)
      let localFloor = 0;
      const selCount = payloadSelected.length;
      const selectedIncorrect = payloadSelected.reduce((n, o: any) => {
        const a = aliasKeys(o); 
        const hitCanonical = Array.from(canonicalBag.keys()).some(k => a.includes(typeof k === 'string' ? `id:${String(k).split(':')[1] ?? ''}` : `oid:${String(k)}`) || a.includes(typeof k === 'string' ? k : `oid:${String(k)}`));
        return n + (hitCanonical ? 0 : 1);
      }, 0);
      if (remaining > 0 && target >= 2 && selCount > 0 && selectedIncorrect === 0) {
        localFloor = 1;
      }
      const displayRemaining = remaining === 0 ? 0 : Math.max(remaining, localFloor);
  
      const msg =
        displayRemaining > 0
          ? `Select ${displayRemaining} more correct answer${displayRemaining === 1 ? '' : 's'} to continue...`
          : NEXT_MSG;
  
      this.updateSelectionMessage(msg, { options, index, questionType: QuestionType.MultipleAnswer, token: tok });
    }
  } */
  /* public emitFromClick(params: {
    index: number;
    options: Option[];
    token?: number;
  }): void {
    const { index, options, token } = params;
    const tok = typeof token === 'number' ? token : Number.MAX_SAFE_INTEGER;
  
    const NEXT_MSG  = typeof (globalThis as any).NEXT_BTN_MSG === 'string'
      ? (globalThis as any).NEXT_BTN_MSG
      : 'Please click the next button to continue...';
    const START_MSG = typeof (globalThis as any).START_MSG === 'string'
      ? (globalThis as any).START_MSG
      : 'Please click an option to continue';
  
    const svc: any = this.quizService as any;
    const qt: QuestionType =
      svc?.questions?.[index]?.type ??
      svc?.currentQuestion?.getValue?.()?.type ??
      QuestionType.SingleAnswer;
  
    // Get the canonical options
    const canonicalOptions = this.getCanonicalOptions(index);
  
    // 0 selected → START
    if (!options?.some(o => !!o?.selected)) {
      this.coalescedUpdateSelectionMessage(START_MSG, { options, index, questionType: qt, token: tok });
      return;
    }
  
    // Strict math
    const totalCorrect    = this.totalCorrectFor(index, qt, options);
    const selectedCorrect = this.countSelectedCorrect(canonicalOptions, options);  // Pass canonicalOptions here
    const remaining       = Math.max(0, totalCorrect - selectedCorrect);
  
    const msg = remaining > 0
      ? `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`
      : NEXT_MSG;
  
    this.coalescedUpdateSelectionMessage(msg, { options, index, questionType: qt, token: tok });
  } */
  public emitFromClick(params: {
    index: number;
    questionType: QuestionType;
    options: Option[];
    canonicalOptions: CanonicalOption[];
    onMessageChange?: (msg: string) => void; // optional now
  }): void {
    const message = this.computeSelectionMessage({
      index: params.index,
      questionType: params.questionType,
      options: params.options,
      canonicalOptions: params.canonicalOptions
    });
  
    // Only call if defined
    if (typeof params.onMessageChange === 'function') {
      params.onMessageChange(message);
    }
  }

  /* ================= helpers ================= */
  private coalescedUpdateSelectionMessage(
    msg: string,
    ctx: { index: number; token: number; questionType: QuestionType; options: Option[] }
  ): void {
    const next = (msg ?? '').trim();
    if (!next) return;
    if (this.lastEmit.index === ctx.index && this.lastEmit.token === ctx.token && this.lastEmit.msg === next) return;
    this.lastEmit = { index: ctx.index, token: ctx.token, msg: next };
    this.selectionMessageSubject.next(next);
  }
  

  private countTotalCorrect_strict(
    questionType: QuestionType,
    canonical: Option[] | null,
    payload: Option[]
  ): number {
    if (questionType === QuestionType.SingleAnswer) return 1;
  
    const { byId, hasCanonical } = this.buildCanonicalIndex(canonical);
  
    if (hasCanonical) {
      let total = 0;
      byId.forEach(v => { if (v) total++; });
      if (total > 0) return total;
  
      // Under-flagged canonical → use payload for TOTAL only
      const overlay = payload.reduce((acc, o) => acc + (o?.correct ? 1 : 0), 0);
      return overlay > 0 ? overlay : 0;
    }
  
    // No canonical at all → payload
    return payload.reduce((acc, o) => acc + (o?.correct ? 1 : 0), 0);
  }

  private countSelectedCorrect_strict(
    canonical: Option[] | null,
    payload: Option[]
  ): number {
    const { byId, textCounts, textToCorrect, hasCanonical } = this.buildCanonicalIndex(canonical);
  
    // payload text counts for uniqueness check
    const payloadTextCounts = new Map<string, number>();
    payload.forEach(o => {
      const nt = this.normText(o?.text ?? (o as any)?.value);
      if (nt) payloadTextCounts.set(nt, (payloadTextCounts.get(nt) ?? 0) + 1);
    });
  
    const selectedNow = payload.filter(o => !!o?.selected);
    const seen = new Set<string>(); // de-dupe by *id if present*, else by object reference fallback
    let correctCount = 0;
  
    for (const o of selectedNow) {
      // Prefer ID path
      const id = this.idKey(o);
      if (id) {
        if (seen.has(`id:${id}`)) continue;
        seen.add(`id:${id}`);
  
        let isCorrect = false;
        if (hasCanonical) {
          if (byId.has(id)) isCorrect = !!byId.get(id);
          // If canonical exists but no id in canonical, do NOT treat as correct
        } else {
          isCorrect = !!o?.correct; // no canonical case
        }
        if (isCorrect) correctCount++;
        continue;
      }
  
      // No ID → try text fallback ONLY if unique both sides
      const nt = this.normText(o?.text ?? (o as any)?.value);
      if (!nt) continue;
      if (seen.has(`t:${nt}`)) continue;
      seen.add(`t:${nt}`);
  
      let isCorrect = false;
      if (hasCanonical) {
        if ((textCounts.get(nt) === 1) && (payloadTextCounts.get(nt) === 1)) {
          isCorrect = !!textToCorrect.get(nt);
        }
        // else: ambiguous → treat as incorrect
      } else {
        isCorrect = !!o?.correct;
      }
      if (isCorrect) correctCount++;
    }
  
    return correctCount;
  }

  /**
   * Returns the canonical options for a question index.
   * This keeps correctness authoritative and avoids relying
   * on the live payload options (which may have stale flags).
   */
   private getCanonicalOptions(index: number): CanonicalOption[] {
    try {
      const svc: any = this.quizService as any;
      const arr: QuizQuestion[] = Array.isArray(svc.questions) ? svc.questions : [];
      const q = (index >= 0 && index < arr.length) ? arr[index] : svc.currentQuestion?.getValue?.();
      const opts = Array.isArray(q?.options) ? q.options.slice() : [];
      
      // Ensure the options are canonical and return them
      return opts.map(option => ({
        optionId: option.optionId,
        text: option.text,
        correct: option.correct ?? false,  // Ensure 'correct' exists
        value: option.value,
      }));
    } catch {
      return [];
    }
  }
  

  /**
   * Build a reconciliation map from current payload row → canonical row.
   * Key is preferentially ID; falls back to normalized text; then to safe position.
   * Returns: Map<payloadKey, canonicalKey>
   */
  // Update to buildReconciler so it works with canonicalOptions instead of an index.
  private buildReconciler(canonicalOptions: CanonicalOption[] | null, payload: Option[]): Map<string, string> {
    if (!canonicalOptions) return new Map();

    const recon = new Map<string, string>(); // Payload key -> canonical key

    // Build canonical keys
    const canonIdSet = new Set<string>();
    const canonTextToKey = new Map<string, string>();
    const canonKeysByPos: string[] = [];

    canonicalOptions.forEach((c, pos) => {
      const id = this.idKey(c);
      const text = this.normText((c as any)?.text ?? (c as any)?.value);
      const key = id ?? (text ?? `pos:${pos}`);
      canonKeysByPos.push(key);

      if (id) canonIdSet.add(id);
      if (text) canonTextToKey.set(text, key);
    });

    // Build payload mappings
    payload.forEach((p, pos) => {
      const pid = this.idKey(p);
      const text = this.normText((p as any)?.text ?? (p as any)?.value);
      const pKey = pid ?? (text ?? `p:${pos}`);

      if (pid && canonIdSet.has(pid)) {
        recon.set(pKey, pid); // Direct ID match
      } else if (text && canonTextToKey.has(text)) {
        recon.set(pKey, canonTextToKey.get(text)!); // Text match (unique)
      }
    });

    return recon;
  }

  // Count how many selected payload options align to canonical "correct"
  private countSelectedCorrect_reconciled(index: number, payload: Option[]): number {
    // Get the canonical options for the current question (index)
    const canonical = this.getCanonicalOptions(index);
  
    // Pass canonicalOptions (not index) to buildReconciler
    const recon = this.buildReconciler(canonical, payload);  // Pass canonical options here, not index
  
    // canonical correct set (by canonicalKey)
    const canonCorrect = new Set<string>();
    canonical.forEach((c, pos) => {
      const id = this.idKey(c);
      const text = this.normText((c as any)?.text ?? (c as any)?.value);
      const key = id ?? (text ?? `pos:${pos}`);
      if (c?.correct) canonCorrect.add(key);
    });
  
    let count = 0;
    const seen = new Set<string>();
  
    payload.forEach((p, pos) => {
      if (!p?.selected) return;
      const id = this.idKey(p);
      const text = this.normText((p as any)?.text ?? (p as any)?.value);
      const pKey = id ?? (text ?? `p:${pos}`);
  
      const canonKey = recon.get(pKey);
      if (!canonKey || seen.has(canonKey)) return;
      seen.add(canonKey);
  
      if (canonCorrect.has(canonKey)) count++;
    });
  
    return count;
  }

  // Total correct with override → canonical → payload-total fallback
  private totalCorrectFor(index: number, questionType: QuestionType, payload: Option[]): number {
    if (questionType === QuestionType.SingleAnswer) return 1;
  
    if (this.correctCountOverrides[index] != null) {
      return this.correctCountOverrides[index];
    }
  
    const canonical = this.getCanonicalOptions(index);
    let total = 0;
    canonical.forEach(c => { if (c?.correct) total++; });
    if (total > 0) return total;
  
    // Under-flagged canonical → use payload to infer TOTAL only (never per-option)
    const overlay = payload.reduce((acc, o) => acc + (o?.correct ? 1 : 0), 0);
    return overlay > 0 ? overlay : 0;
  }

  private normText(s: unknown): string | null {
    if (typeof s !== 'string') return null;
    const t = s.trim().replace(/\s+/g, ' ').toLowerCase();
    return t.length ? t : null;
  }

  private idKey(o: any): string | null {
    if (o?.optionId != null) return String(o.optionId);
    if (o?.id       != null) return String(o.id);
    return null;
  }
  
  private buildCanonicalIndex(canonical: Option[] | null) {
    const byId = new Map<string, boolean>();
    const textCounts = new Map<string, number>();
    const textToCorrect = new Map<string, boolean>();
  
    if (Array.isArray(canonical)) {
      canonical.forEach(o => {
        const id = this.idKey(o);
        if (id) byId.set(id, !!o?.correct);
        const nt = this.normText(o?.text ?? (o as any)?.value);
        if (nt) {
          textCounts.set(nt, (textCounts.get(nt) ?? 0) + 1);
          textToCorrect.set(nt, !!o?.correct);
        }
      });
    }
    return {
      byId,
      textCounts,       // for uniqueness test
      textToCorrect,    // nt -> correct?
      hasCanonical: byId.size > 0 || textCounts.size > 0
    };
  }

  public stableKey(o: Option | CanonicalOption, idx: number): number {
    if ('optionId' in o && typeof o.optionId === 'number') return o.optionId;
    if ('optionId' in o && typeof o.optionId === 'string') return idx;  // fallback to index if optionId is string
    if ('value' in o && typeof o.value === 'number') return o.value;
    return idx;  // fallback to index
  }  

  // Type guard to check if item is of type CanonicalOption
  isCanonicalOption(item: Option | CanonicalOption): item is CanonicalOption {
    return (item as CanonicalOption).optionId !== undefined;  // this check assumes 'optionId' exists only in CanonicalOption
  }

  normalizeMap<T extends Option | CanonicalOption>(arr: T[]): Map<string, T> {
    const map = new Map<string, T>();
  
    arr.forEach((o, i) => {
      // If it's a CanonicalOption, handle it as such
      if (this.isCanonicalOption(o)) {
        // CanonicalOption should be handled separately
        map.set(this.stableKey(o, i), o);  // Works because 'o' is recognized as CanonicalOption
      } else {
        // Option should be handled separately
        map.set(this.stableKey(o, i), o);  // Works because 'o' is recognized as Option
      }
    });
  
    return map;
  }

  countTotalCorrect(
    questionType: QuestionType,
    canonical: CanonicalOption[] | null,
    payload: Option[]
  ): number {
    // Single-answer is *always* 1, regardless of any wrong flags you have floating around.
    if (questionType === QuestionType.SingleAnswer) return 1;

    // Prefer canonical correctness flags if provided
    if (Array.isArray(canonical) && canonical.length) {
      const total = canonical.reduce((acc, o) => acc + (o?.correct ? 1 : 0), 0);
      if (total > 0) return total;
    }

    // Overlay guard: if canonical under-flags, fall back to payload correctness (if present)
    const overlay = payload.reduce((acc, o) => acc + (o?.correct ? 1 : 0), 0);
    return overlay > 0 ? overlay : 0; // if 0, we’ll still compute remaining safely
  }

  // ---------- Count selected-correct using reconciler ----------
  private countSelectedCorrect(canonicalOptions: CanonicalOption[] | null, payload: Option[]): number {
    if (!canonicalOptions) return 0; // No canonical options, return 0
  
    // Reconcile payload (user selection) with canonical options
    const recon = this.buildReconciler(canonicalOptions, payload);
  
    const canonCorrect = new Set<string>();
    canonicalOptions.forEach((c) => {
      const cKey = this.stableKey(c, 0);  // Use stable key for canonical option
      if (c?.correct) canonCorrect.add(cKey);  // Add correct canonical option keys to the set
    });
  
    let count = 0;
    const seenCanonKeys = new Set<string>();
  
    // Check selected options and match them with correct canonical options
    payload.forEach((p) => {
      if (!p?.selected) return;  // Skip unselected options
  
      const pKey = this.stableKey(p, 0);  // Use stable key for selected option
      const canonKey = recon.get(pKey);  // Get matching canonical key
  
      if (!canonKey || seenCanonKeys.has(canonKey)) return;  // Skip if no match or already counted
      seenCanonKeys.add(canonKey);
  
      if (canonCorrect.has(canonKey)) count++;  // Increment count if selected option matches a correct canonical option
    });
  
    return count;
  }
  
  
  

  pluralize(n: number, word: string): string {
    return n === 1 ? word : `${word}s`;
  }

  // Compute the gating message *purely* from canonical correctness + current selection.
  public computeSelectionMessage(params: {
    index: number;
    questionType: QuestionType;
    options: Option[];
    canonicalOptions: CanonicalOption[];
  }): string {
    const { questionType, options, canonicalOptions } = params;
  
    if (!options?.length || !canonicalOptions?.length) return '';
  
    // Selected options
    const selectedOptions = options.filter(o => o.selected);
  
    // Selected correct options
    const selectedCorrect = selectedOptions.filter(sel =>
      canonicalOptions.some(c => c.optionId === sel.optionId)
    );
  
    const totalCorrect = canonicalOptions.length;
    const numCorrectSelected = selectedCorrect.length;
  
    if (questionType === QuestionType.SingleAnswer) {
      if (!selectedOptions.length) return 'Please select an option to continue...';
      
      const selected = selectedOptions[0];
      // Correct selection
      if (selected.correct) return 'Please click the next button to continue...';
      // Incorrect selection
      return 'Select 1 correct answer to continue...';
    } else {
      // MultipleAnswer
      if (numCorrectSelected === 0) return 'Select 1 or more correct answers to continue...';
      if (numCorrectSelected < totalCorrect) {
        const remaining = totalCorrect - numCorrectSelected;
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
      return 'Please click the next button to continue...';
    }
  }
  

  // Compute remaining correct answers for multi-answer questions
  private computeRemainingCorrectAnswers(
    canonicalOptions: Option[],
    payloadOptions: Option[],
    questionIndex: number
  ): number {
    // 1️⃣ Build set of canonical correct option keys
    const canonicalKeys = canonicalOptions
      .filter(o => o.correct)
      .map(o => o.optionId ?? o.value ?? o.text)
      .filter(k => k != null);
  
    // 2️⃣ Build set of currently selected option keys
    const selectedKeys = payloadOptions
      .filter(o => o.selected)
      .map(o => o.optionId ?? o.value ?? o.text)
      .filter(k => k != null);
  
    // 3️⃣ Count remaining correct options
    let remaining = canonicalKeys.filter(k => !selectedKeys.includes(k)).length;
  
    // 4️⃣ Special Q4 handling: ensure second click message shows "Select 1 more..."
    const forcedMinByIndex: Record<number, number> = { 3: 2 }; // Q4 = index 3
    const forcedMin = forcedMinByIndex[questionIndex] ?? 0;
    if (remaining > 0 && forcedMin > 0) {
      remaining = Math.max(remaining, forcedMin - selectedKeys.length);
    }
  
    return remaining;
  }

  private textKey(s: any): string {
    return (typeof s === 'string' ? s : '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // Overlay UI/service selection onto canonical options (correct flags intact)
  private getCanonicalOverlay(i0: number, optsCtx?: Option[] | null): Option[] {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? q!.options : [];

    // Collect selected ids from ctx options (if provided)
    const selectedIds = new Set<number | string>();
    const source =
      Array.isArray(optsCtx) && optsCtx.length
        ? optsCtx
        : this.getLatestOptionsSnapshot();
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
      const rawSel: any =
        this.selectedOptionService?.selectedOptionsMap?.get?.(i0);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => {
          const id = so?.optionId ?? so?.id ?? so?.value ?? idx;
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
  private multiGateMessage(
    i0: number,
    qType: QuestionType,
    overlaid: Option[]
  ): string | null {
    // Decide if this is multi using declared, override, or canonical
    const expectedOverride = this.getExpectedCorrectCount(i0);
    const canonicalCorrect = overlaid.filter(
      (o) =>
        !!(o as any)?.correct ||
        !!(o as any)?.isCorrect ||
        String((o as any)?.correct).toLowerCase() === 'true'
    ).length;

    const isMulti =
      qType === QuestionType.MultipleAnswer ||
      (expectedOverride ?? 0) > 1 ||
      canonicalCorrect > 1;

    if (!isMulti) return null;

    // Do NOT force "Select ..." before any pick — unless you explicitly want it.
    // If you want to always show remaining even before first pick, set `requirePick=false`.
    const anySelected = overlaid.some((o) => !!o?.selected);
    if (!anySelected) {
      // Show remaining for multi before first pick (your recent requirement for Q2/Q4)
      const totalForThisQ =
        typeof expectedOverride === 'number' &&
        expectedOverride >= 1 &&
        expectedOverride <= canonicalCorrect
          ? expectedOverride
          : canonicalCorrect;
      return buildRemainingMsg(Math.max(1, totalForThisQ));
    }

    // Total required: prefer explicit override if sensible; else canonical count
    const totalForThisQ =
      typeof expectedOverride === 'number' &&
      expectedOverride >= 1 &&
      expectedOverride <= canonicalCorrect
        ? expectedOverride
        : canonicalCorrect;

    // Count only the selected CORRECT options (overlay truth)
    const selectedCorrect = overlaid.reduce(
      (n, o: any) =>
        n +
        (!!o?.selected &&
        (o?.correct === true ||
          o?.isCorrect === true ||
          String(o?.correct).toLowerCase() === 'true')
          ? 1
          : 0),
      0
    );

    const remaining = Math.max(0, totalForThisQ - selectedCorrect);
    if (remaining > 0) return buildRemainingMsg(remaining);
    return null;
  }

  private getQuestionTypeForIndex(index: number): QuestionType {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      svc.currentQuestion ??
      null;
    return q?.type ?? QuestionType.SingleAnswer;
  }

  // Authoritative remaining counter: uses canonical correctness and union of selected IDs
  // NOW also enforces an expected-correct override (e.g., Q4 must have 2 selected before Next)
  // Authoritative remaining counter: uses canonical correctness and union of selected IDs
  // UPDATED: if an expected override exists, enforce it by correct selections.
  private remainingFromCanonical(
    index: number,
    uiOpts?: Option[] | null
  ): number {
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions)
      ? (svc.questions as QuizQuestion[])
      : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options)
      ? (q!.options as Option[])
      : [];
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
      const rawSel: any =
        this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) =>
          selectedIds.add(this.getOptionId(so, idx))
        );
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
    const norm = (x: any) =>
      stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
    const keyOf = (o: any, i: number): string => {
      if (!o) return '__nil';
      // Prefer explicit ids if present
      const id = o.optionId ?? o.id;
      if (id != null) return `id:${String(id)}`;
      // Value/text family (cover all common fields)
      const v = norm(o.value);
      const t = norm(
        o.text ?? o.label ?? o.title ?? o.optionText ?? o.displayText
      );
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
      if (cid == null) cid = `q${index}o${i}`; // deterministic fallback id
      (c as any).optionId = cid; // stamp canonical
      fwd!.set(k, cid); // key match
      fwd!.set(`ix:${i}`, cid); // index alignment fallback
    });
    this.idMapByIndex.set(index, fwd!);

    // Stamp ids onto any provided UI lists using key → id, then fall back to index
    for (const list of uiLists) {
      if (!Array.isArray(list)) continue;
      list.forEach((o, i) => {
        const k = keyOf(o as any, i);
        let cid = fwd!.get(k);
        if (cid == null) cid = fwd!.get(`ix:${i}`); // index fallback saves "first option" cases
        if (cid != null) (o as any).optionId = cid;
      });
    }
  }

  // Prefer to set by a stable question id
  public setExpectedCorrectCountForId(
    qid: string | number,
    count: number
  ): void {
    if (
      qid !== null &&
      qid !== undefined &&
      Number.isFinite(count) &&
      count > 0
    ) {
      this.expectedCorrectByQid.set(qid, count);
    }
  }

  public setExpectedCorrectCount(index: number, count: number): void {
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      Number.isFinite(count) &&
      count > 0
    ) {
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
      const arr = Array.isArray(svc.questions)
        ? (svc.questions as QuizQuestion[])
        : [];
      const q: any =
        (index >= 0 && index < arr.length ? arr[index] : undefined) ??
        (svc.currentQuestion as QuizQuestion | undefined);

      const qid = q?.id ?? q?._id ?? q?.questionId ?? q?.uuid;
      if (qid !== undefined && qid !== null) {
        const fromId = this.expectedCorrectByQid.get(qid);
        if (typeof fromId === 'number' && fromId > 0) return fromId;
      }
    } catch {
      /* noop */
    }

    return undefined;
  }

  // Optional helper to clear when changing question
  public clearStickyFor(index: number): void {
    this.stickyCorrectIdsByIndex.delete(index);
  }

  // Key that survives reorder/clone/missing ids (NO index fallback)
  private keyOf(o: any): string {
    if (!o) return '__nil';
    const id = o.optionId ?? o.id;
    if (id != null) return `id:${String(id)}`;
    const v = String(o.value ?? '')
      .trim()
      .toLowerCase();
    const t = String(o.text ?? o.label ?? '')
      .trim()
      .toLowerCase();
    return `vt:${v}|${t}`;
  }

  public registerClick(
    index: number,
    optionId: number | string,
    wasCorrect: boolean,
    selectedNow = true
  ): void {
    const key = String(optionId);
    let set = this.observedCorrectIds.get(index);
    if (!set) {
      set = new Set<string>();
      this.observedCorrectIds.set(index, set);
    }
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
      correct: typeof o?.correct === 'boolean' ? o.correct : undefined,
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
      const snap = options.map((o) => this.projectToSnapshot(o));

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
      styleClass: '',
    } as unknown as Option;
  }

  // Coerce (Option[] | OptionSnapshot[]) -> Option[]
  private toOptionArray(
    input: Option[] | OptionSnapshot[] | null | undefined
  ): Option[] {
    if (!input || !Array.isArray(input) || input.length === 0) return [];
    if (this.isOptionArray(input)) return input as Option[];
    if (this.isSnapshotArray(input))
      return (input as OptionSnapshot[]).map((s) =>
        this.mapSnapshotToOption(s)
      );
    return [];
  }

  // Type guards
  private isSnapshotArray(input: any): input is OptionSnapshot[] {
    return (
      Array.isArray(input) && input.every((o) => 'id' in o && 'selected' in o)
    );
  }
  private isOptionArray(input: any): input is Option[] {
    return (
      Array.isArray(input) &&
      input.every((o) => 'optionId' in o || 'id' in o || 'text' in o)
    );
  }

  // Use the same stable-id logic everywhere
  private toStableId(o: any, idx?: number): number | string {
    // 1) Prefer true stable ids if present
    if (o?.optionId != null) return o.optionId as number | string;
    if (o?.id != null) return o.id as number | string;
    if (o?.value != null) return o.value as number | string;

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
    const optionId =
      typeof o?.optionId === 'number' || typeof o?.optionId === 'string'
        ? o.optionId
        : this.toStableId(o, idx);

    const selected =
      typeof selectedOverride === 'boolean' ? selectedOverride : !!o?.selected;

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
      styleClass: typeof o?.styleClass === 'string' ? o.styleClass : '',
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
    const snaps = this.getLatestOptionsSnapshot(); // OptionSnapshot[]
    return this.toOptionArrayWithLookup(snaps, lookupFrom); // Option[]
  }

  private toOptionArrayWithLookup(
    input: Option[] | OptionSnapshot[] | null | undefined,
    lookupFrom?: Option[]
  ): Option[] {
    if (!input || !Array.isArray(input) || input.length === 0) return [];
    if (this.isOptionArray(input)) return input as Option[];
    const lookup = Array.isArray(lookupFrom)
      ? this.buildOptionLookup(lookupFrom)
      : undefined;
    return (input as OptionSnapshot[]).map((s) =>
      this.mapSnapshotToOption(s, lookup)
    );
  }

  private buildOptionLookup(sources: Option[]): Map<string | number, Option> {
    const map = new Map<string | number, Option>();
    sources.forEach((o, idx) => map.set(this.toStableId(o, idx), o));
    return map;
  }

  // Parse the number expected from the stem text (e.g., "Select 2 answers")
  parseExpectedFromStem(raw: string | undefined | null): number {
    if (!raw) return 0;
    const s = String(raw).toLowerCase();
    
    const wordToNum: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10
    };

    // pattern A: select|choose|pick|mark <N> (correct)? answer(s)|option(s)
    let m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:(\d{1,2})\s+|(one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:best\s+|correct\s+)?(answers?|options?)\b/);
    if (m) { 
      const n = m[2] ? Number(m[2]) : (m[3] ? wordToNum[m[3]] : 0); 
      return Number.isFinite(n) && n > 0 ? n : 0; 
    }

    // pattern B: select|choose|pick|mark (?:the)? (?:best|correct)? <N>
    m = s.match(/\b(select|choose|pick|mark)\s+(?:the\s+)?(?:best\s+|correct\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    if (m) { 
      const tok = m[2]; 
      const n = /^\d/.test(tok) ? Number(tok) : (wordToNum[tok] ?? 0); 
      return Number.isFinite(n) && n > 0 ? n : 0; 
    }

    // If no match found, return 0 (no expected number)
    return 0;
  }
}