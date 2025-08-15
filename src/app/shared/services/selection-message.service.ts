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
  public lastSelectionMutation = 0;
  private latestByIndex = new Map<number, number>();
  private freezeNextishUntil = new Map<number, number>();   // block Next-ish until ts
  private suppressPassiveUntil = new Map<number, number>();
  private debugWrites = false;
  private correctIdsByIndex = new Map<number, Set<number | string>>();
  private nextLockByIndex = new Map<number, boolean>();
  private remainingByIndex = new Map<number, number>();

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
              ?? (svc.currentQuestion as QuizQuestion | undefined)
              ?? null;
  
    // Resolve declared type (may be stale)
    const declaredType: QuestionType | undefined =
      q?.type ?? this.quizService.currentQuestion?.getValue()?.type ?? this.quizService.currentQuestion.value.type;
  
    // ---- Stable key: prefer explicit ids; fall back to value|text (no index cross-pollution) ----
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
  
    // Overlay selection into CANONICAL (correct flags intact)
    const canonical = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const overlaid: Option[] = canonical.length
      ? canonical.map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) }))
      : uiSnapshot.map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) || !!o?.selected })); // fallback
  
    // If the data has >1 correct, treat as MultipleAnswer even if declared type is wrong
    const computedIsMulti = overlaid.filter(o => !!o?.correct).length > 1;
    const qType: QuestionType = computedIsMulti ? QuestionType.MultipleAnswer
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
    qType: QuestionType;   // kept for compatibility but we’ll trust data if it disagrees
    opts: Option[];        // UI view (selection state)
  }): string {
    const { index, total, qType, opts } = args;

    const isLast = total > 0 && index === total - 1;

    // ---- Stable key (no index-based mismatches) ----
    const keyOf = (o: any): string | number => {
      if (!o) return '__nil';
      if (o.optionId != null) return o.optionId;
      if (o.id != null) return o.id;
      const val = (o.value ?? '').toString().trim().toLowerCase();
      const txt = (o.text  ?? o.label ?? '').toString().trim().toLowerCase();
      return `${val}|${txt}`;
    };

    // 1) Canonical question/options (authoritative `correct`)
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];

    // 2) Build selected KEYS union: caller’s opts + SelectedOptionService
    const selectedKeys = new Set<string | number>();
    // a) from caller’s opts (current UI selection)
    for (let i = 0; i < (opts?.length ?? 0); i++) {
      const o = opts[i];
      if (o?.selected) selectedKeys.add(keyOf(o));
    }
    // b) from SelectedOptionService (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedKeys.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any) => selectedKeys.add(keyOf(so)));
      }
    } catch {}

    // 3) Overlay selection onto CANONICAL (keeps reliable `correct`)
    const overlaid: Option[] = canonical.length
      ? canonical.map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) }))
      : (opts ?? []).map(o => ({ ...o, selected: selectedKeys.has(keyOf(o)) || !!o?.selected }));

    // 4) Compute authoritative state
    const anySelected     = overlaid.some(o => !!o?.selected);
    const totalCorrect    = overlaid.filter(o => !!o?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining       = Math.max(0, totalCorrect - selectedCorrect);

    // 5) Decide multi from data (data wins if disagreement)
    const isMulti = totalCorrect > 1 || qType === QuestionType.MultipleAnswer;

    // 6) Your existing wording rules (unchanged)
    if (!anySelected) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }

    if (isMulti) {
      if (remaining > 0) {
        return buildRemainingMsg(remaining); // ⇒ "Select 1 more correct option to continue..."
      }
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
  
      const anySelected = overlaid.some(o => !!o?.selected);
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
  
    const qType: QuestionType = ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
    const isMulti = qType === QuestionType.MultipleAnswer; // ← single source of truth
  
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
  
    // Precompute authoritative state for both branches
    const isLast = i0 === (this.quizService.totalQuestions - 1);
    const anySelected = (opts ?? []).some(o => !!o?.selected);
    const totalCorrect = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
    // MULTI → compute remaining from authoritative options and short-circuit
    if (isMulti) {
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
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    } else {
      // SINGLE → never allow "Select more..."; allow Next/Results when any selected
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
  
    const qType: QuestionType = ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
    const isMulti = qType === QuestionType.MultipleAnswer; // single source of truth
  
    // Use UPDATED options if provided; else snapshot
    const optsCtx: Option[] =
      (Array.isArray(ctx?.options) && ctx!.options!.length)
        ? ctx!.options!
        : this.getLatestOptionsSnapshot();
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // 🔒 During the suppression window, block any Next-ish writes outright.
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) {
      return; // ignore attempts to flip to Next during hold
    }
  
    // If we set an explicit Next-ish freeze, also block Next-ish until the time passes.
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) {
      return;
    }
  
    // ───────────────────────────────────────────────
    // Build AUTHORITATIVE canonical overlay for correctness:
    // union selected ids from: ctx.options + latest snapshot + SelectedOptionService map
    // ───────────────────────────────────────────────
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    const canonical: Option[] = Array.isArray(q?.options) ? q!.options : [];
  
    const selectedIds = new Set<number | string>();
  
    // a) From ctx.options (if provided)
    for (let i = 0; i < (optsCtx?.length ?? 0); i++) {
      const o = optsCtx[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }
  
    // b) From latest UI snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < (snap?.length ?? 0); i++) {
      const o = snap[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }
  
    // c) From SelectedOptionService map (ids or objects)
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
  
    // Overlay selection onto CANONICAL (correct flags intact)
    const overlaid: Option[] = canonical.length
      ? canonical.map((o, idx) => {
          const id = (o as any)?.optionId ?? idx;
          return { ...o, selected: selectedIds.has(id) };
        })
      : optsCtx.map(o => ({ ...o })); // fallback if canonical missing
  
    // Precompute authoritative state for both branches
    const isLast = i0 === (this.quizService.totalQuestions - 1);
    const anySelected = overlaid.some(o => !!o?.selected);
    const totalCorrect = overlaid.filter(o => !!o?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
    // Keep snapshot aligned with what we just reasoned over
    this.setOptionsSnapshot(overlaid);
  
    // ───────────────────────────────────────────────
    // MULTI → compute remaining from authoritative options and short-circuit
    // ───────────────────────────────────────────────
    if (isMulti) {
      // Still missing correct picks → FORCE "Select N more..." and return
      if (remaining > 0) {
        const forced = buildRemainingMsg(remaining); // e.g., "Select 1 more correct answer..."
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
  
      // All correct selected → allow Next/Results immediately
      if (isNextish) {
        if (current !== next) this.selectionMessageSubject.next(next);
        return;
      }
  
      // If not Next-ish, emit the correct final msg now
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    } else {
      // ───────────────────────────────────────────────
      // SINGLE → never allow "Select more..."; allow Next/Results when any selected
      // ───────────────────────────────────────────────
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
  
    // Prefer UPDATED options if provided; else our guard picks the freshest array
    const optsForGuard: Option[] = this.pickOptionsForGuard(ctx?.options, i0);
  
    // Resolve declared type (may be stale). If absent/wrong, infer multi from data.
    const declaredType: QuestionType | undefined =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
    const inferredIsMulti = (optsForGuard.filter(o => !!o?.correct).length > 1);
    const isMulti = declaredType === QuestionType.MultipleAnswer || inferredIsMulti;
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // 🔒 During the suppression window, block any Next-ish writes outright.
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
  
    // If we set an explicit Next-ish freeze, also block Next-ish until the time passes.
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // ───────────────────────────────────────────────
    // **IRON-CLAD GATE**: For MULTI, never allow Next while remaining > 0
    // Uses your authoritative counter that consults SelectedOptionService
    // ───────────────────────────────────────────────
    if (isMulti) {
      const remaining = this.getRemainingCorrectCountByIndex(i0, optsForGuard);
  
      // Still missing correct picks → FORCE "Select N more..." and return
      if (remaining > 0) {
        const forced = buildRemainingMsg(remaining);
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return; // nothing can override while still missing correct picks
      }
  
      // All correct selected → allow Next/Results immediately (ignore any stale 'Select' text)
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // ───────────────────────────────────────────────
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    // ───────────────────────────────────────────────
    const anySelected = (optsForGuard ?? []).some(o => !!o?.selected);
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
  
  // Prefer explicit ids; otherwise derive a stable key from value/text (never use index)
  private getOptionId(opt: any, idx: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;

    // Normalize strings to stabilize across clones/reorders
    const v = (opt.value ?? '').toString().trim().toLowerCase();
    const t = (opt.text  ?? opt.label ?? '').toString().trim().toLowerCase();

    // If both are empty, fall back to a content hash—not the index.
    const key = `${v}|${t}`;
    return key.length ? key : `__contenthash_${JSON.stringify(opt)}`;
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
    options: Option[]; // UPDATED array you already pass
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Snapshot for later passives (kept behavior)
    this.setOptionsSnapshot(options);
  
    // Declared type only
    const isMulti = (questionType === QuestionType.MultipleAnswer);
    const isLast = totalQuestions > 0 && index === totalQuestions - 1;
  
    // Compute remaining off the passed UPDATED array (your canonical or UI+overlay)
    const correct = (options ?? []).filter(o => !!o?.correct);
    const selectedCorrect = correct.filter(o => !!o?.selected).length;
    const remaining = Math.max(0, correct.length - selectedCorrect);
  
    // Update the per-question lock
    this.setRemainingLock(index, remaining);
  
    // 🔥 Decisive click behavior
    if (isMulti) {
      if (remaining > 0) {
        const msg = buildRemainingMsg(remaining);
        const cur = this.selectionMessageSubject.getValue();
        if (cur !== msg) this.selectionMessageSubject.next(msg);
        // brief hold to avoid a passive "Next" flash
        const hold = performance.now() + 450;
        this.suppressPassiveUntil.set(index, hold);
        this.freezeNextishUntil.set(index, hold);
        return;
      }
      // remaining === 0 → legit Next/Results immediately (also clears lock via setRemainingLock)
      const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== msg) this.selectionMessageSubject.next(msg);
      const hold = performance.now() + 250;
      this.suppressPassiveUntil.set(index, hold);
      this.freezeNextishUntil.set(index, hold);
      return;
    }
  
    // Single-answer → always Next/Results after any pick
    const singleMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const cur = this.selectionMessageSubject.getValue();
    if (cur !== singleMsg) this.selectionMessageSubject.next(singleMsg);
    const hold = performance.now() + 250;
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
    const { index: i0, totalQuestions, questionType, options } = params;
  
    // Respect click suppression
    const until = this.suppressPassiveUntil.get(i0) ?? 0;
    if (performance.now() < until) return;
  
    const overlaid = this.getCanonicalOverlay(i0, options);
    this.setOptionsSnapshot(overlaid);
  
    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
  
    const forced = this.multiGateMessage(i0, qType, overlaid);
    if (forced) {
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== forced) this.selectionMessageSubject.next(forced);
      return; // never emit Next while remaining>0
    }
  
    const anySelected = overlaid.some(o => !!o?.selected);
    const msg = (qType === QuestionType.MultipleAnswer)
      ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
      : (anySelected ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                     : (i0 === 0 ? START_MSG : CONTINUE_MSG));
  
    const token = this.beginWrite(i0, 0);
    this.updateSelectionMessage(msg, { options: overlaid, index: i0, token, questionType: qType });
  }
  
  
  // Overlay UI selection onto CANONICAL options (authoritative correct flags)
  // Overlay UI/service selection onto CANONICAL options (correct flags intact)
  private getCanonicalOverlay(i0: number, optsCtx?: Option[] | null): Option[] {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? q!.options : [];

    // 1) Collect selected ids from ctx options (if provided)
    const selectedIds = new Set<number | string>();
    const source = Array.isArray(optsCtx) && optsCtx.length ? optsCtx : this.getLatestOptionsSnapshot();
    for (let i = 0; i < (source?.length ?? 0); i++) {
      const o = source[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }

    // 2) Union with current snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < (snap?.length ?? 0); i++) {
      const o = snap[i];
      const id = (o as any)?.optionId ?? i;
      if (o?.selected) selectedIds.add(id);
    }

    // 3) Union with SelectedOptionService map (if it stores ids/objs)
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

    // 4) Return canonical with selected overlay (fallback to ctx/source if canonical missing)
    return canonical.length
      ? canonical.map((o, idx) => {
          const id = (o as any)?.optionId ?? idx;
          return { ...o, selected: selectedIds.has(id) };
        })
      : source.map(o => ({ ...o }));
  }

  // Build canonical options (authoritative `correct`) with current UI selection overlaid
  private getCanonicalOverlaidOptions(index: number, uiOpts?: Option[] | null): Option[] {
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];

    // Build selected-id set from the freshest UI list we were given (fallback to snapshot)
    const src = Array.isArray(uiOpts) && uiOpts.length ? uiOpts : this.getLatestOptionsSnapshot();
    const selectedIds = new Set<number | string>();
    for (let i = 0; i < src.length; i++) {
      const o = src[i];
      const id = (o as any)?.optionId ?? i; // stable id or index
      if (o?.selected) selectedIds.add(id);
    }

    // Overlay selection onto canonical (keeps authoritative `correct`)
    return canonical.length
      ? canonical.map((o, i) => {
          const id = (o as any)?.optionId ?? i;
          return { ...o, selected: selectedIds.has(id) };
        })
      : src.map(o => ({ ...o })); // fallback if canonical missing (shouldn’t happen)
  }


  // Gate: if multi & remaining>0, return the forced "Select N more..." message; else null
  private multiGateMessage(i0: number, qType: QuestionType, overlaid: Option[]): string | null {
    if (qType !== QuestionType.MultipleAnswer) return null;
    const totalCorrect    = overlaid.filter(o => !!o?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining       = Math.max(0, totalCorrect - selectedCorrect);
    if (remaining > 0) return buildRemainingMsg(remaining); // e.g., "Select 1 more correct answer..."
    return null;
  }


  private getQuestionTypeForIndex(index: number): QuestionType {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (index >= 0 && index < qArr.length ? qArr[index] : undefined) ?? svc.currentQuestion ?? null;
    return q?.type ?? QuestionType.SingleAnswer;
  }

  // Single source of stable IDs
  private stableId(o: any, idx: number): number | string {
    return (o?.optionId ?? o?.id ?? `${o?.value ?? ''}|${o?.text ?? ''}|${idx}`);
  }

  private getCorrectIds(i0: number): Set<number | string> {
    const cached = this.correctIdsByIndex.get(i0);
    if (cached) return cached;
  
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < arr.length ? arr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    const ids = new Set<number | string>();
    if (q?.options?.length) {
      q.options.forEach((o, idx) => {
        if (o?.correct) ids.add(this.stableId(o, idx));
      });
    }
    this.correctIdsByIndex.set(i0, ids);
    return ids;
  }

  private getSelectedIdsUnion(i0: number, optsCtx?: Option[] | null): Set<number | string> {
    const selected = new Set<number | string>();
  
    // a) From ctx.options (updated UI passed by caller)
    const srcA = Array.isArray(optsCtx) ? optsCtx : [];
    for (let i = 0; i < srcA.length; i++) {
      const o = srcA[i];
      if (o?.selected) selected.add(this.stableId(o, i));
    }
  
    // b) From latest snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const o = snap[i];
      if (o?.selected) selected.add(this.stableId(o, i));
    }
  
    // c) From SelectedOptionService (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(i0);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selected.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => selected.add(this.stableId(so, idx)));
      }
    } catch {}
  
    return selected;
  }

  private setRemainingLock(index: number, remaining: number): void {
    this.remainingByIndex.set(index, Math.max(0, remaining));
    if (remaining > 0) {
      this.nextLockByIndex.set(index, true);
    } else {
      this.nextLockByIndex.delete(index);
    }
  }

  private isNextLocked(index: number): boolean {
    return this.nextLockByIndex.get(index) === true;
  }

  /**
   * Authoritative "remaining correct" counter for a question.
   * - Reads CORRECT flags only from the canonical question model (never UI clones).
   * - Builds a selected-id UNION from:
   *   a) ctx options passed to the call,
   *   b) latest UI snapshot,
   *   c) SelectedOptionService map (ids or SelectedOption objects).
   */
  private getRemainingAuthoritative(index: number, optsCtx?: Option[] | null): number {
    // 1) Canonical question/options (has real `correct`)
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);

    const canonical = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    if (!canonical.length) return 0; // nothing to compute

    // 2) Build selected-id UNION
    const selectedIds = new Set<number | string>();

    // a) ctx options
    if (Array.isArray(optsCtx)) {
      for (let i = 0; i < optsCtx.length; i++) {
        const o = optsCtx[i];
        if (o?.selected) selectedIds.add(this.stableId(o, i));
      }
    }

    // b) latest UI snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const o = snap[i];
      if (o?.selected) selectedIds.add(this.stableId(o, i));
    }

    // c) SelectedOptionService map (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => selectedIds.add(this.stableId(so, idx)));
      }
    } catch {}

    // 3) Count remaining using canonical `correct`
    let totalCorrect = 0;
    let selectedCorrect = 0;
    for (let i = 0; i < canonical.length; i++) {
      const o = canonical[i];
      if (o?.correct) {
        totalCorrect++;
        if (selectedIds.has(this.stableId(o, i))) selectedCorrect++;
      }
    }
    return Math.max(0, totalCorrect - selectedCorrect);
  }

}