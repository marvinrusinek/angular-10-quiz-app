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
  private lastRemainingByIndex = new Map<number, number>();
  private enforceUntilByIndex = new Map<number, number>();
  private expectedCorrectByIndex = new Map<number, number>();

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
    const isMulti = (totalCorrect > 1) || (qType === QuestionType.MultipleAnswer);

    // BEFORE ANY PICK:
    // For MULTI, show "Select N more correct answers..." (N = totalCorrect).
    // For SINGLE, keep START/CONTINUE.
    if (!anySelected) {
      if (isMulti) {
        // With no selections, remaining === totalCorrect — exactly what we want
        return buildRemainingMsg(totalCorrect);
      }
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }

    if (isMulti) {
      // HARD GATE: never show Next/Results while any correct answers remain
      if (remaining > 0) {
        return buildRemainingMsg(remaining);
      }
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }

    // Single-answer → immediately Next/Results
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  }

  // Build message on click (correct wording and logic)
  public buildMessageFromSelection(params: {
    index: number;  // 0-based
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
  }): string {
    const { index, totalQuestions, questionType, options } = params;
  
    const isLast  = totalQuestions > 0 && index === totalQuestions - 1;
    const isMulti = questionType === QuestionType.MultipleAnswer;
  
    if (isMulti) {
      // Use canonical correctness + union of selections
      const remaining = this.remainingFromCanonical(index, options);
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
  // Add near your service fields:
  private minTotalCorrectFloorByIndex = new Map<number, number>();

  public updateSelectionMessage(
    message: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType; }
  ): void {
    // ──────────────────────────────────────────────────────────────────────────
    // 0) Defensive gates & stable write token (prevents stale async overwrites)
    // ──────────────────────────────────────────────────────────────────────────
    const current = this.selectionMessageSubject.getValue();
    const next = (message ?? '').trim();
  
    // allow empty only when we have options context to recompute below
    if (!next && !ctx?.options?.length) return;
  
    const i0 = (typeof ctx?.index === 'number' && Number.isFinite(ctx.index))
      ? (ctx!.index as number)
      : (this.quizService.currentQuestionIndex ?? 0);
  
    // Token-based last-writer-wins
    if (typeof ctx?.token === 'number') {
      if (!this._lastWrite || ctx.token >= this._lastWrite.token) {
        this._lastWrite = { token: ctx.token, index: i0 };
      } else {
        // Stale write—ignore entirely
        return;
      }
    }
  
    const qTypeDeclared /*: QuestionType | undefined*/ =
      ctx?.questionType ?? this.getQuestionTypeForIndex(i0);
  
    // Prefer updated options if provided; else snapshot for our gate
    const optsCtx: Option[] | undefined =
      (Array.isArray(ctx?.options) && ctx!.options!.length ? ctx!.options! : undefined);
  
    // Resolve canonical once (keep your original logic)
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    // Normalize ids so subsequent remaining/guards compare apples-to-apples
    this.ensureStableIds(
      i0,
      (q as any)?.options ?? [],
      optsCtx ?? this.getLatestOptionsSnapshot()
    );
  
    // ──────────────────────────────────────────────────────────────────────────
    // NEW: build a merged, up-to-date snapshot by optionId (fixes Q4 race)
    // ──────────────────────────────────────────────────────────────────────────
    const mergedSnapshot = this.mergeSnapshotById(
      optsCtx,                        // primary (just-clicked options)
      this.getLatestOptionsSnapshot() // secondary (service latest)
    );
  
    // Authoritative remaining from canonical + union of selected ids
    const baseSnapshot = mergedSnapshot;
    const remaining = this.remainingFromCanonical(i0, baseSnapshot);
  
    // Decide multi from data or declared type (canonical is truth)
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const totalCorrect = canonical.filter(o => !!o?.correct).length;
  
    // SINGLE SOURCE OF TRUTH for multi
    const isMulti =
      (totalCorrect > 1) ||
      (qTypeDeclared as QuestionType | undefined) === QuestionType.MultipleAnswer;
  
    // ──────────────────────────────────────────────────────────────────────────
    // Classifiers (stronger coverage for "next-ish" and "select-ish")
    // ──────────────────────────────────────────────────────────────────────────
    const low = (next || '').toLowerCase().replace(/\s+/g, ' ').trim();
  
    // “Select … more … continue” or variants like “…to continue”
    const isSelectish =
      /^select\s+\d+\s+more\b.*\b(continue|to continue)/.test(low) ||
      (low.startsWith('select ') && low.includes('more') && low.includes('continue'));
  
    // “Next-ish” also catches “continue”, “proceed”, “go next”, “advance”, etc.
    const isNextish =
      /\b(next|next button|proceed|continue|advance|show results|results)\b/.test(low);
  
    // ──────────────────────────────────────────────────────────────────────────
    // 1) Overlay guard for under-flagged canonical correctness (e.g., Q4)
    // ──────────────────────────────────────────────────────────────────────────
    // 1) Overlay guard for under-flagged canonical correctness (e.g., Q4)
    const stats = this.computeSelectionStats(baseSnapshot);
    // stats: { totalCorrectLike, selectedTotal, selectedCorrectLike }

    // ⬇️ Explicit expected-count short-circuit (Q4)
    const expectedOverride = this.getExpectedCorrectCount?.(i0);
    if (isMulti && typeof expectedOverride === 'number' && expectedOverride > 0) {
      const expectedRemaining = Math.max(0, expectedOverride - stats.selectedCorrectLike);
      if (expectedRemaining > 0) {
        // Use the wording you want: “answer(s)”
        const forced = `Select ${expectedRemaining} more correct answer${expectedRemaining === 1 ? '' : 's'} to continue...`;

        // Emit now…
        const currentLower = (current || '').toLowerCase();
        const isAlreadyForced = currentLower.startsWith('select ') && currentLower.includes('continue');
        if (!isAlreadyForced || current !== forced) {
          this.selectionMessageSubject.next(forced);
        }

        // …and schedule a post-frame clamp to beat any late writers
        this.scheduleSelectionClamp(i0, expectedRemaining, forced);

        // Debug: prove if something else fights us
        // console.debug('[Clamp] Q', i0 + 1, 'expectedRemaining=', expectedRemaining, 'selectedCorrectLike=', stats.selectedCorrectLike);

        return; // hard-stop: do not allow “Next” until explicit expected is satisfied
      }
    }

    let effectiveRemaining = remaining;

    if (isMulti) {
      const overlaid = this.overlayGuard(
        {
          canonicalTotalCorrect: totalCorrect,
          selectedCorrectLike: stats.selectedCorrectLike,
          selectedTotal: stats.selectedTotal
        },
        qTypeDeclared as QuestionType | undefined
      );

      if (overlaid?.forceMessage) {
        if (current !== overlaid.forceMessage) {
          this.selectionMessageSubject.next(overlaid.forceMessage);
          // Also ensure last-writer wins if someone emits "Next" after us
          this.scheduleSelectionClamp(i0, 1, overlaid.forceMessage);
        }
        return;
      }

      if (overlaid?.overlayTotalCorrect && overlaid.overlayTotalCorrect > totalCorrect) {
        const overlayRemaining = Math.max(
          0,
          overlaid.overlayTotalCorrect - stats.selectedCorrectLike
        );
        effectiveRemaining = overlayRemaining;
      }
    }
      
    // ──────────────────────────────────────────────────────────────────────────
    // 2) Suppression windows: block “Next-ish” flashes while user is still selecting
    // ──────────────────────────────────────────────────────────────────────────
    const now = performance.now();
    const passiveHold = (this.suppressPassiveUntil.get(i0) ?? 0);
    if (now < passiveHold && isNextish) return;
    const nextFreeze = (this.freezeNextishUntil.get(i0) ?? 0);
    if (now < nextFreeze && isNextish) return;
  
    // Per-question "remaining" lock. While remaining>0, force "Select N..." and return.
    const prevRem = this.lastRemainingByIndex.get(i0);
    if (prevRem === undefined || effectiveRemaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, effectiveRemaining);
      if (effectiveRemaining > 0 && (prevRem === undefined || effectiveRemaining < prevRem)) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (effectiveRemaining === 0) this.enforceUntilByIndex.delete(i0);
    }
  
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;
  
    // ──────────────────────────────────────────────────────────────────────────
    // 3) MULTI hard guard + Q4 CLAMP (keyed off isMulti)
    // ──────────────────────────────────────────────────────────────────────────
    if (isMulti) {
      const snap = baseSnapshot;
      const correctLike = (o: Option) =>
        o?.correct === true || /(^|\b)(correct|✅|right|true)\b/i.test(o?.feedback ?? '');
  
      const totalCorrectCanonical = totalCorrect;
      const totalCorrectLike = snap.reduce((n, o) => n + (correctLike(o) ? 1 : 0), 0);
      const selectedCorrectLike  = snap.reduce((n, o) => n + (correctLike(o) && !!o?.selected ? 1 : 0), 0);
      const unselectedCorrectLike = snap.reduce((n, o) => n + (correctLike(o) && !o?.selected ? 1 : 0), 0);
  
      const inferredTotal = Math.max(totalCorrectCanonical, totalCorrectLike);
      const inferredRemaining = Math.max(0, inferredTotal - selectedCorrectLike);
      const hardRemaining = Math.max(effectiveRemaining, inferredRemaining);
  
      if (hardRemaining > 0 || inEnforce || unselectedCorrectLike > 0) {
        const forced = buildRemainingMsg(Math.max(1, hardRemaining || unselectedCorrectLike));
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return; // absolutely block Next/Results
      }
  
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
  
    // ──────────────────────────────────────────────────────────────────────────
    // 4) SINGLE → never allow “Select more…”
    // ──────────────────────────────────────────────────────────────────────────
    const anySelected = baseSnapshot.some(o => !!o?.selected);
    const isLast = i0 === (this.quizService.totalQuestions - 1);
  
    if (isSelectish) {
      const replacement = anySelected ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                                      : (i0 === 0 ? START_MSG : CONTINUE_MSG);
      if (current !== replacement) this.selectionMessageSubject.next(replacement);
      return;
    }
  
    if (isNextish && anySelected) {
      // ——— FINAL NEXT-ISH KILL-SWITCH (Q4 race safety net) ———
      if (isMulti) {
        // Re-pull a fresh merged snapshot right before emission
        const fresh = this.mergeSnapshotById(baseSnapshot, this.getLatestOptionsSnapshot());
        const correctLike = (o: Option) =>
          o?.correct === true || /(^|\b)(correct|✅|right|true)\b/i.test(o?.feedback ?? '');
        const unselectedCorrectLike = fresh.reduce((n, o) => n + (correctLike(o) && !o?.selected ? 1 : 0), 0);
        if (unselectedCorrectLike > 0) {
          const forced = buildRemainingMsg(unselectedCorrectLike);
          if (current !== forced) this.selectionMessageSubject.next(forced);
          return;
        }
      }
      if (current !== next) this.selectionMessageSubject.next(next);
      return;
    }
  
    // Stale writer guard (only for ambiguous cases)
    const inFreeze = this.inFreezeWindow?.(i0) ?? false;
    const latestToken = this.latestByIndex.get(i0);
    if (inFreeze && ctx?.token !== latestToken) return;
  
    // ——— FINAL NEXT-ISH KILL-SWITCH (Q4 race safety net) ———
    if (isNextish && isMulti) {
      const fresh = this.mergeSnapshotById(baseSnapshot, this.getLatestOptionsSnapshot());
      const correctLike = (o: Option) =>
        o?.correct === true || /(^|\b)(correct|✅|right|true)\b/i.test(o?.feedback ?? '');
      const unselectedCorrectLike = fresh.reduce((n, o) => n + (correctLike(o) && !o?.selected ? 1 : 0), 0);
      if (unselectedCorrectLike > 0) {
        const forced = buildRemainingMsg(unselectedCorrectLike);
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return;
      }
    }
  
    if (current !== next) this.selectionMessageSubject.next(next);
  }
  
  /* ────────────────────────────────────────────────────────────────────────────
     NEW helper: merge two option snapshots by optionId, preferring "selected=true".
     Place this helper in the same service.
  ──────────────────────────────────────────────────────────────────────────── */
  
  private mergeSnapshotById(
    primary?: Option[] | null,
    secondary?: Option[] | null
  ): Option[] {
    const byId = new Map<any, Option>();
  
    // seed with secondary (service latest)
    if (Array.isArray(secondary)) {
      for (const o of secondary) {
        byId.set(o?.optionId, { ...(o as any) });
      }
    }
  
    // overlay with primary (newest event payload)
    if (Array.isArray(primary)) {
      for (const o of primary) {
        const key = (o as any)?.optionId;
        const prev = byId.get(key) ?? {};
        byId.set(key, {
          ...(prev as any),
          ...(o as any),
          // favor a selected=true from either side
          selected: !!((o as any)?.selected ?? (prev as any)?.selected)
        } as Option);
      }
    }
  
    return Array.from(byId.values());
  }  
  
  /* ────────────────────────────────────────────────────────────────────────────
     Helpers (add below in the same service)
     If you already have equivalents, keep yours.
  ──────────────────────────────────────────────────────────────────────────── */
  
  private _lastWrite: { token: number; index: number } | null = null;
  
  /**
   * Computes relaxed “correct-like” stats so we can survive under-flagged authoring.
   * A choice is treated as correct-like if `o.correct === true` OR feedback hints at correctness.
   */
  private computeSelectionStats(options: Option[] | undefined): {
    totalCorrectLike: number;
    selectedTotal: number;
    selectedCorrectLike: number;
  } {
    if (!Array.isArray(options) || options.length === 0) {
      return { totalCorrectLike: 0, selectedTotal: 0, selectedCorrectLike: 0 };
    }
  
    let totalCorrectLike = 0;
    let selectedTotal = 0;
    let selectedCorrectLike = 0;
  
    for (const o of options) {
      const isCorrectLike =
        o.correct === true || /(^|\b)(correct|✅|right|true)\b/i.test(o?.feedback ?? '');
      const isSelected = !!o.selected;
  
      if (isCorrectLike) totalCorrectLike++;
      if (isSelected) {
        selectedTotal++;
        if (isCorrectLike) selectedCorrectLike++;
      }
    }
  
    return { totalCorrectLike, selectedTotal, selectedCorrectLike };
  }
  
  /**
   * Overlay guard for under-flagged canonical correctness.
   * - If canonical says ≤1 correct but user has found ≥2 correct-like → keep selecting.
   * - If canonical says 0 but user has ≥1 correct-like while still selecting → keep selecting.
   * Returns either a forced UX message or an overlay total for recomputing “remaining”.
   */
  private overlayGuard(
    stats: {
      canonicalTotalCorrect: number;
      selectedCorrectLike: number;
      selectedTotal: number;
    },
    questionType?: QuestionType
  ): { forceMessage?: string; overlayTotalCorrect?: number } | null {
    if (questionType !== QuestionType.MultipleAnswer) return null;
  
    const { canonicalTotalCorrect, selectedCorrectLike, selectedTotal } = stats;
  
    // Case A: canonical under-reports (≤1) but user found ≥2 correct-like
    if ((canonicalTotalCorrect <= 1) && selectedCorrectLike >= 2) {
      return {
        forceMessage: 'Looks like more than one option is correct. Keep selecting all that apply…',
        overlayTotalCorrect: Math.max(2, canonicalTotalCorrect)
      };
    }
  
    // Case B: canonical is 0 but user has progress → keep them going
    if (canonicalTotalCorrect === 0 && selectedCorrectLike >= 1) {
      if (selectedTotal > selectedCorrectLike) {
        return { forceMessage: 'Keep selecting the remaining correct options…', overlayTotalCorrect: selectedCorrectLike + 1 };
      }
      return { forceMessage: 'Multiple correct answers detected. Select all that apply…', overlayTotalCorrect: Math.max(2, selectedCorrectLike) };
    }
  
    return null;
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
  private getOptionId(opt: any, idx: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;
  
    // Disambiguate duplicates by ordinal (index) within the same question.
    // keyOf(...) is stable across clones; the "#idx" suffix prevents collisions.
    const key = this.keyOf(opt);
    return `${key}#${idx}`;
  }  

  // Index-aware resolver: NEVER reads currentQuestionIndex.
  // Resolve an option's stable id specifically for the given question index.
  // Index-aware ID resolver: never reads currentQuestionIndex
  // Uses the per-question registry in idMapByIndex when available.
  private getOptionIdFor(index: number, opt: any, fallbackIdx: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;

    const key = this.keyOf(opt);
    const map = this.idMapByIndex.get(index);
    const mapped = map?.get(key);
    return mapped != null ? mapped : key;
  }

  // Resolve an option's stable id for a specific question index
  private getOptionIdAt(qIndex: number, opt: any, idx: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;

    const key = this.keyOf(opt);  // content key ("id:..." or "vt:...")

    // Use the registry for THIS question index (not currentQuestionIndex)
    const map = this.idMapByIndex.get(qIndex);
    const mapped = map?.get(key);
    if (mapped != null) return mapped;

    // Synthesize an id that’s namespaced by question index
    return `q${qIndex}~${key}~${idx}`;
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
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Always stamp/normalize IDs FIRST so canonical and UI share the same optionId space.
    try {
      const svc: any = this.quizService as any;
      const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
      const q: QuizQuestion | undefined =
        (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
        (svc.currentQuestion as QuizQuestion | undefined);
  
      const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
  
      // Safe no-op if canonical is empty or already stamped.
      this.ensureStableIds(index, canonical, options, this.getLatestOptionsSnapshot());
    } catch {}
  
    // Snapshot for later passives (kept behavior)
    this.setOptionsSnapshot(options);
  
    // Authoritative remaining from canonical + union of selected ids
    let remaining = this.remainingFromCanonical(index, options);
  
    // Also compute an OVERLAY view to detect under-flagged canonical correctness
    const overlaid = this.getCanonicalOverlay(index, options);
    const overlayTotalCorrect    = overlaid.filter(o => !!o?.correct).length;
    const overlaySelectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const overlayRemaining       = Math.max(0, overlayTotalCorrect - overlaySelectedCorrect);
  
    // Canonical totalCorrect (may under-report on some questions like Q4)
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    const canonicalTotalCorrect = canonical.filter(o => !!o?.correct).length;
  
    // Guard: if declared MULTI and overlay shows more correct answers than canonical,
    // trust the overlay for the remaining count so we gate properly.
    if (questionType === QuestionType.MultipleAnswer && overlayTotalCorrect > canonicalTotalCorrect) {
      remaining = overlayRemaining;
    }
  
    // Decide multi from data first; fall back to declared type
    const isMulti = (overlayTotalCorrect > 1) || (questionType === QuestionType.MultipleAnswer);
    const isLast  = totalQuestions > 0 && index === totalQuestions - 1;
  
    // Decisive click behavior (with freeze to avoid flashes)
    if (isMulti) {
      if (remaining > 0) {
        const msg = buildRemainingMsg(remaining);
        const cur = this.selectionMessageSubject.getValue();
        if (cur !== msg) this.selectionMessageSubject.next(msg);
  
        const now = performance.now();
        const hold = now + 1200;
        this.suppressPassiveUntil.set(index, hold);
        this.freezeNextishUntil.set(index, hold);
        return; // never emit Next while remaining > 0
      }
  
      // remaining === 0 → legit Next/Results immediately
      const msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== msg) this.selectionMessageSubject.next(msg);
  
      const now = performance.now();
      const hold = now + 300;
      this.suppressPassiveUntil.set(index, hold);
      this.freezeNextishUntil.set(index, hold);
      return;
    }
  
    // Single-answer → always Next/Results after any pick
    const singleMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    const cur = this.selectionMessageSubject.getValue();
    if (cur !== singleMsg) this.selectionMessageSubject.next(singleMsg);
  
    const now = performance.now();
    const hold = now + 300;
    this.suppressPassiveUntil.set(index, hold);
    this.freezeNextishUntil.set(index, hold);
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
  
    // Respect click suppression
    const until = this.suppressPassiveUntil.get(i0) ?? 0;
    if (performance.now() < until) return;
  
    // 🔹 Normalize IDs before we overlay
    try {
      const svc: any = this.quizService as any;
      const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
      const q: QuizQuestion | undefined =
        (i0 >= 0 && i0 < qArr.length ? qArr[i0] : undefined) ??
        (svc.currentQuestion as QuizQuestion | undefined);
      this.ensureStableIds(i0, (q as any)?.options ?? [], options);
    } catch {}
  
    const overlaid = this.getCanonicalOverlay(i0, options);
    this.setOptionsSnapshot(overlaid);
  
    const qType = questionType ?? this.getQuestionTypeForIndex(i0);
    const isLast = totalQuestions > 0 && i0 === totalQuestions - 1;
  
    const forced = this.multiGateMessage(i0, qType, overlaid);
    if (forced) {
      const cur = this.selectionMessageSubject.getValue();
      if (cur !== forced) this.selectionMessageSubject.next(forced);
      return;
    }
  
    const anySelected = overlaid.some(o => !!o?.selected);
    const msg = (qType === QuestionType.MultipleAnswer)
      ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
      : (anySelected ? (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG)
                     : (i0 === 0 ? START_MSG : CONTINUE_MSG));
  
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
  
    // Ensure IDs are stamped for this question first (safe no-op if already done)
    try { this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot()); } catch {}
  
    // Collect selected ids from ctx options (INDEX-AWARE)
    const selectedIds = new Set<number | string>();
    const source = Array.isArray(optsCtx) && optsCtx.length ? optsCtx : this.getLatestOptionsSnapshot();
  
    for (let i = 0; i < (source?.length ?? 0); i++) {
      const o = source[i];
      if (o?.selected) selectedIds.add(this.getOptionIdFor(i0, o, i));
    }
  
    // Union with current snapshot (INDEX-AWARE)
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < (snap?.length ?? 0); i++) {
      const o = snap[i];
      if (o?.selected) selectedIds.add(this.getOptionIdFor(i0, o, i));
    }
  
    // Union with SelectedOptionService (INDEX-AWARE)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(i0);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, idx: number) => selectedIds.add(this.getOptionIdFor(i0, so, idx)));
      }
    } catch {}
  
    // Return canonical with selected overlay (INDEX-AWARE compare)
    return canonical.length
      ? canonical.map((o, idx) => {
          const id = this.getOptionIdFor(i0, o, idx);
          return { ...o, selected: selectedIds.has(id) };
        })
      : source.map(o => ({ ...o }));
  }
  
  
  // Gate: if multi & remaining>0, return the forced "Select N more..." message; else null
  private multiGateMessage(i0: number, qType: QuestionType, overlaid: Option[]): string | null {
    if (qType !== QuestionType.MultipleAnswer) return null;
    const totalCorrect = overlaid.filter(o => !!o?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining = Math.max(0, totalCorrect - selectedCorrect);
    if (remaining > 0) return buildRemainingMsg(remaining);  // e.g., "Select 1 more correct answer..."
    return null;
  }

  // Build a unified set of selected IDs for a given question index.
  // Sources: (a) primary UI list (if provided), (b) latest snapshot, (c) SelectedOptionService map.
  // Always resolves IDs using the *question index* to avoid index drift.
  /** Build a union of selected IDs from:
   *  - uiOpts (if provided),
   *  - latest snapshot,
   *  - SelectedOptionService map
   *  All IDs are resolved *for this question index*.
   */
  private buildSelectedIdUnion(index: number, uiOpts?: Option[] | null): Set<number | string> {
    const selected = new Set<number | string>();

    // From UI options if provided
    if (Array.isArray(uiOpts)) {
      for (let i = 0; i < uiOpts.length; i++) {
        const o = uiOpts[i];
        if (o?.selected) selected.add(this.getOptionIdFor(index, o, i)); // ← index-aware add
      }
    }

    // From latest snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const o = snap[i];
      if (o?.selected) selected.add(this.getOptionIdFor(index, o, i));   // ← index-aware add
    }

    // From SelectedOptionService (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selected.add(id)); // already canonical ids
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, i: number) => {
          selected.add(this.getOptionIdFor(index, so, i));               // ← index-aware add
        });
      }
    } catch {}

    return selected;
  }

  private getQuestionTypeForIndex(index: number): QuestionType {
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q = (index >= 0 && index < qArr.length ? qArr[index] : undefined) ?? svc.currentQuestion ?? null;
    return q?.type ?? QuestionType.SingleAnswer;
  }

  // Authoritative remaining counter: uses canonical correctness and union of selected IDs
  private remainingFromCanonical(index: number, uiOpts?: Option[] | null): number {
    const svc: any = this.quizService as any;
    const arr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < arr.length ? arr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    const canonical: Option[] = Array.isArray(q?.options) ? (q!.options as Option[]) : [];
    if (!canonical.length) return 0;
  
    // Ensure IDs are stamped for this question (safe no-op if already stamped)
    try { this.ensureStableIds(index, canonical, uiOpts ?? this.getLatestOptionsSnapshot()); } catch {}
  
    // Build selected IDs union from UI and SelectedOptionService
    const selectedIds = new Set<number | string>();
  
    // From UI options if provided
    if (Array.isArray(uiOpts)) {
      for (let i = 0; i < uiOpts.length; i++) {
        const o = uiOpts[i] as any;
        const id = (o?.optionId ?? this.getOptionId(o, i));
        if (o?.selected) selectedIds.add(id);
      }
    }
  
    // From latest snapshot
    const snap = this.getLatestOptionsSnapshot();
    for (let i = 0; i < snap.length; i++) {
      const o = snap[i] as any;
      const id = (o?.optionId ?? this.getOptionId(o, i));
      if (o?.selected) selectedIds.add(id);
    }
  
    // From SelectedOptionService (ids or objects)
    try {
      const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
      if (rawSel instanceof Set) {
        rawSel.forEach((id: any) => selectedIds.add(id));
      } else if (Array.isArray(rawSel)) {
        rawSel.forEach((so: any, i: number) => {
          const id = (so?.optionId ?? this.getOptionId(so, i));
          selectedIds.add(id);
        });
      }
    } catch {}
  
    // Count remaining using canonical correctness and stable IDs
    let totalCorrect = 0;
    let selectedCorrect = 0;
    for (let i = 0; i < canonical.length; i++) {
      const c = canonical[i] as any;
      if (!c?.correct) continue;
      totalCorrect++;
      const id = (c?.optionId ?? this.getOptionId(c, i));
      if (selectedIds.has(id)) selectedCorrect++;
    }
    return Math.max(0, totalCorrect - selectedCorrect);
  }
  
  

  // Content-only key (never uses ids) to detect duplicate labels/values safely
  private contentKey(o: any): string {
    const v = String(o?.value ?? '').trim().toLowerCase();
    const t = String(o?.text ?? o?.label ?? '').trim().toLowerCase();
    return `vt:${v}|${t}`;
  }

  private stampIdsFresh(index: number, canonical: Option[] | null | undefined, ...uiLists: (Option[] | null | undefined)[]): void {
    // Blow away any stale mapping for this index
    this.idMapByIndex.delete(index);
    // Recreate + stamp via existing routine
    this.ensureStableIds(index, canonical ?? [], ...uiLists);
  }

  // Ensure every canonical option has a stable optionId.
  // Also stamp matching ids onto any UI list passed in.
  // Ensure every canonical option has a stable optionId.

  // Also stamp matching ids onto any UI list passed in.
  // This version is ORDINAL-AWARE: if multiple options share the same key/text,
  // we map the 1st UI occurrence to the 1st canonical occurrence for that key,
  // the 2nd to the 2nd, etc. This prevents collisions on multi-answer items.
  private ensureStableIds(
    index: number,
    canonical: Option[] | null | undefined,
    ...uiLists: (Option[] | null | undefined)[]
  ): void {
    const canon = Array.isArray(canonical) ? canonical : [];
    if (!canon.length) return;

    // Build (or reuse) the forward map for this question: key -> canonicalId(s) in order.
    // We also stamp an optionId directly on the canonical options.
    // NOTE: we keep a QUEUE (array) per key to handle duplicates by ordinal.
    let fwd = this.idMapByIndex.get(index);
    if (!fwd) {
      fwd = new Map<string, string | number>();
      this.idMapByIndex.set(index, fwd);
    }

    // Collect queues of canonical ids by key (ordinal-aware).
    const queueByKey = new Map<string, Array<string | number>>();
    for (let i = 0; i < canon.length; i++) {
      const c = canon[i] as any;
      const key = this.keyOf(c); // stable content key or id:..., vt:...
      const cid = (c.optionId ?? c.id ?? `q${index}o${i}`) as string | number;
      c.optionId = cid;

      let q = queueByKey.get(key);
      if (!q) {
        q = [];
        queueByKey.set(key, q);
      }
      q.push(cid);

      // Keep the first occurrence in the flat map for backwards compatibility.
      if (!fwd.has(key)) fwd.set(key, cid);
    }

    // For each UI list, stamp optionId by consuming from the queue in order.
    for (const list of uiLists) {
      if (!Array.isArray(list) || list.length === 0) continue;

      // Track how many times we've seen a key in THIS list so we can
      // pick the 1st/2nd/3rd canonical id for duplicates.
      const usedCountByKey = new Map<string, number>();

      for (let i = 0; i < list.length; i++) {
        const o = list[i] as any;
        const key = this.keyOf(o);

        const q = queueByKey.get(key);
        if (q && q.length) {
          const used = usedCountByKey.get(key) ?? 0;
          const cid = q[Math.min(used, q.length - 1)];
          usedCountByKey.set(key, used + 1);
          o.optionId = cid;
        } else {
          // Fallbacks:
          // 1) If forward map has a single id for this key, use it.
          // 2) Else keep any existing optionId, or synthesize a unique one.
          const fallback =
            fwd.get(key) ??
            (o.optionId ?? o.id ?? `q${index}u${i}`);
          o.optionId = fallback;
        }
      }
    }
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

  public setExpectedCorrectCount(index: number, count: number): void {
    if (Number.isInteger(index) && index >= 0 && Number.isFinite(count) && count > 0) {
      this.expectedCorrectByIndex.set(index, count);
    }
  }
  
  private getExpectedCorrectCount(index: number): number | undefined {
    const n = this.expectedCorrectByIndex.get(index);
    return (typeof n === 'number' && n > 0) ? n : undefined;
  }

  // Ensures our guarded message wins even if another writer emits later in the same tick
  private scheduleSelectionClamp(
    index: number,
    remaining: number,
    text: string
  ): void {
    // rAF → after layout/paint; microtasks & same-tick next() calls have already fired
    requestAnimationFrame(() => {
      // Only clamp if we're still on the same question and still need remaining > 0
      const curIdx = this.quizService?.currentQuestionIndex ?? index;
      if (curIdx !== index) return;

      // If someone flipped it to "Next", take control again.
      const cur = this.selectionMessageSubject.getValue();
      const low = (cur || '').toLowerCase();
      const isNextish =
        /\b(next|next button|proceed|continue|advance|show results|results)\b/.test(low);

      if (remaining > 0 && isNextish) {
        // Final say.
        this.selectionMessageSubject.next(text);
      }
    });
  }
}