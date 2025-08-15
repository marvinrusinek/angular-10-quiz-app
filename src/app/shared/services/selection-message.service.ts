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
  
    const isLast  = total > 0 && index === total - 1;
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    // Selected/correct from authoritative, overlaid opts
    const anySelected     = opts.some(o => !!o?.selected);
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining       = Math.max(0, totalCorrect - selectedCorrect);
  
    // Nothing picked yet
    if (!anySelected) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    if (isMulti) {
      // Never show Next/Results while any correct answers remain
      if (remaining > 0) {
        return buildRemainingMsg(remaining);
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
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    // Prefer UPDATED options (ctx), but compute overlaid canonical for correctness
    const overlaid = this.getCanonicalOverlay(i0, ctx?.options);
    this.setOptionsSnapshot(overlaid); // keep snapshot aligned with what we reason over
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // 🔒 Suppress "Next-ish" during short hold windows
    const now = performance.now();
    const passiveHold   = this.suppressPassiveUntil.get(i0) ?? 0;
    const nextFreeze    = this.freezeNextishUntil.get(i0) ?? 0;
    if ((now < passiveHold || now < nextFreeze) && isNextish) return;
  
    // ── IRON-CLAD GATE ──
    const forced = this.multiGateMessage(i0, qType, overlaid);
    if (forced) {
      if (current !== forced) this.selectionMessageSubject.next(forced);
      return; // nothing can override while a correct pick is still missing
    }
  
    // With remaining===0 or single-answer, proceed with your original logic
    const isLast = i0 === (this.quizService.totalQuestions - 1);
    const anySelected = overlaid.some(o => !!o?.selected);
  
    if (isMulti) {
      // All correct picked → Next/Results
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
    }
  
    // Stale-writer guard (only for ambiguous cases)
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
  
    const qType: QuestionType = ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
    const isMulti = qType === QuestionType.MultipleAnswer;
  
    // Prefer UPDATED options; still compute selected via union so we don't miss anything
    const optsCtx = Array.isArray(ctx?.options) ? ctx!.options! : undefined;
  
    // Classifiers
    const low = next.toLowerCase();
    const isSelectish = low.startsWith('select ') && low.includes('more') && low.includes('continue');
    const isNextish   = low.includes('next button') || low.includes('show results');
  
    // 🔒 Suppress "Next-ish" during short hold windows
    const now = performance.now();
    const passiveHold = this.suppressPassiveUntil.get(i0) ?? 0;
    if (now < passiveHold && isNextish) return;
    const nextFreeze = this.freezeNextishUntil.get(i0) ?? 0;
    if (now < nextFreeze && isNextish) return;
  
    // ── IRON-CLAD GATE using immutable correctIds vs selectedIds union ──
    const selectedIds = this.getSelectedIdsUnion(i0, optsCtx);
    const forced = this.multiGateMessageByIds(i0, qType, selectedIds);
    if (forced) {
      if (current !== forced) this.selectionMessageSubject.next(forced);
      return; // nothing can override while a correct pick is still missing
    }
  
    // With remaining===0 or single-answer, proceed with your original logic
    const isLast = i0 === (this.quizService.totalQuestions - 1);
  
    if (isMulti) {
      // All correct picked → Next/Results
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    } else {
      // SINGLE → never allow "Select more..."; allow Next/Results when any selected
      const anySelected = selectedIds.size > 0;
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
    options: Option[];
  }): void {
    const { index: i0, totalQuestions, questionType, options } = params;
  
    // Snapshot what we were passed (good for UI re-renders)
    this.setOptionsSnapshot(options);
  
    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
  
    // Gate first (IDs)
    const selectedIds = this.getSelectedIdsUnion(i0, options);
    const forced = this.multiGateMessageByIds(i0, qType, selectedIds);
    if (forced) {
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== forced) this.selectionMessageSubject.next(forced);
      const hold = performance.now() + 600;
      this.suppressPassiveUntil.set(i0, hold);
      this.freezeNextishUntil.set(i0, hold);
      return;
    }
  
    // remaining===0 or single → Next/Results
    const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const cur = this.selectionMessageSubject.getValue();
    if (cur !== msg) this.selectionMessageSubject.next(msg);
  
    const hold = performance.now() + 300;
    this.suppressPassiveUntil.set(i0, hold);
    this.freezeNextishUntil.set(i0, hold);
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

  // Returns forced message while multi & still missing correct picks; else null
  private multiGateMessageByIds(i0: number, qType: QuestionType, selectedIds: Set<number | string>): string | null {
    if (qType !== QuestionType.MultipleAnswer) return null;

    const correctIds = this.getCorrectIds(i0);
    let selectedCorrect = 0;
    correctIds.forEach(id => { if (selectedIds.has(id)) selectedCorrect++; });

    const remaining = Math.max(0, correctIds.size - selectedCorrect);
    return remaining > 0 ? buildRemainingMsg(remaining) : null;
  }
}