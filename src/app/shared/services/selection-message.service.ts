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

  // Force a minimum number of correct answers for specific questions (e.g., Q4 ⇒ 3)
  private expectedCorrectByIndex = new Map<number, number>();

  // Tracks selected-correct option ids per question (survives wrong clicks)
  public stickyCorrectIdsByIndex = new Map<number, Set<number | string>>();
  public stickyAnySelectedKeysByIndex = new Map<number, Set<string>>();  // fallback store

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
    const selectedCorrectCount  = overlaidForCorrect.filter(o => !!o?.correct && !!o?.selected).length;

    // Expected total for this Q: prefer override, else canonical correct count
    const totalForThisQ = (expectedOverride ?? totalCorrectCanonical);

    // Enforce remaining using CORRECT picks, and keep canonical guard too
    const expectedRemainingByCorrect = Math.max(0, totalForThisQ - selectedCorrectCount);
    const enforcedRemaining = Math.max(remaining, expectedRemainingByCorrect);
  
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
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[]; // updated array already passed
  }): void {
    const { index, totalQuestions, questionType, options } = params;
  
    // Keep the previous snapshot so unions can see earlier selections
    const priorSnap = this.getLatestOptionsSnapshot();
  
    // Always derive gating from canonical correctness (UI may lack reliable `correct`)
    // Primary: authoritative remaining from canonical and union of selected ids
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
  
    if (totalCorrectCanon === 0 && totalCorrect > 0) {
      const selectedCorrectFallback = (options ?? []).filter(
        o => ( (!!(o as any)?.correct || !!(o as any)?.isCorrect) && !!(o as any)?.selected )
      ).length;
      remaining = Math.max(0, totalCorrect - selectedCorrectFallback);
    }
  
    // Decide multi from canonical first; fall back to declared type
    const isMulti = (totalCorrect > 1) || (questionType === QuestionType.MultipleAnswer);
    const isLast  = totalQuestions > 0 && index === totalQuestions - 1;
  
    // ──────────────────────────────────────────────────────────────────────────
    // Expected-correct override merged with canonical remaining — use SELECTED-CORRECT
    // (prevents wrong picks from satisfying the override)
    // ──────────────────────────────────────────────────────────────────────────
    const expectedOverrideRaw = this.getExpectedCorrectCount(index);
  
    // If no explicit override, fall back to canonical totalCorrect (keeps other questions unchanged)
    const expectedTarget =
      (typeof expectedOverrideRaw === 'number' && expectedOverrideRaw > 0)
        ? expectedOverrideRaw
        : totalCorrect;
  
    // Compute selected *correct* using canonical overlay (robust against id/key drift)
    const overlaidForCorrect = this.getCanonicalOverlay(index, options);
    const selectedCorrectCount = overlaidForCorrect.reduce(
      (n, o: any) => n + (((!!o?.correct || !!o?.isCorrect) && !!o?.selected) ? 1 : 0),
      0
    );
  
    // Remaining driven by correct picks only
    const expectedRemainingByCorrect = Math.max(0, expectedTarget - selectedCorrectCount);
  
    // Final enforced remaining combines canonical remaining + override-correct remaining
    const enforcedRemaining = Math.max(remaining, expectedRemainingByCorrect);
    // ──────────────────────────────────────────────────────────────────────────
  
    if (isMulti) {
      let gateRemaining = enforcedRemaining;
  
      // Tighten ONLY when an explicit override exists AND this is Q4 (idx 3)
      const expectedOverrideClick = this.getExpectedCorrectCount(index);
      const tightenForThisQ =
        (typeof expectedOverrideClick === 'number' && expectedOverrideClick > 0 && index === 3);
  
      if (tightenForThisQ) {
        // ── Robust tighten: union(answer+flags) by normalized KEY, with sticky & fallback ──
        const stripHtml = (s: any) => String(s ?? '').replace(/<[^>]*>/g, ' ');
        const norm      = (x: any) => stripHtml(x).replace(/\s+/g, ' ').trim().toLowerCase();
        const keyOf     = (o: any, i: number) => {
          const v = norm(o?.value);
          const t = norm(o?.text ?? o?.label ?? o?.title ?? o?.optionText ?? o?.displayText);
          return (v || t) ? `vt:${v}|${t}` : `id:${String(o?.optionId ?? o?.id ?? i)}`;
        };
  
        // Map ids -> keys for canonical (helps match ids coming from services)
        const idToKey = new Map<any, string>();
        const canonKeys: string[] = [];
        for (let i = 0; i < canonical.length; i++) {
          const c: any = canonical[i];
          const k = keyOf(c, i);
          canonKeys.push(k);
          const cid = c?.optionId ?? c?.id ?? i;
          idToKey.set(cid, k);
        }
  
        // 1) Build correct key set = UNION(answer-derived, flag-derived)
        const correctKeysFromAnswer = new Set<string>();
        const correctKeysFromFlags  = new Set<string>();
  
        const ans: any = (q as any)?.answer;
        if (Array.isArray(ans) && ans.length) {
          for (let i = 0; i < canonical.length; i++) {
            const c: any = canonical[i];
            const cid = c?.optionId ?? c?.id ?? i;
            const v   = norm(c?.value);
            const t   = norm(c?.text ?? c?.label ?? c?.title ?? c?.optionText ?? c?.displayText);
            const matched = ans.some((a: any) => {
              if (a == null) return false;
              if (typeof a === 'object') {
                const aid = (a?.optionId ?? a?.id);
                if (aid != null && (aid === cid)) return true;
                const av = norm(a?.value);
                const at = norm(a?.text ?? a?.label ?? a?.title ?? a?.optionText ?? a?.displayText);
                return (!!av && av === v) || (!!at && at === t);
              }
              if (a === cid) return true;
              const s = norm(a);
              return (!!s && (s === v || s === t));
            });
            if (matched) correctKeysFromAnswer.add(canonKeys[i]);
          }
        }
        for (let i = 0; i < canonical.length; i++) {
          const c: any = canonical[i];
          const flag = !!c?.correct || !!c?.isCorrect || String(c?.correct).toLowerCase() === 'true';
          if (flag) correctKeysFromFlags.add(canonKeys[i]);
        }
  
        const correctKeySet = new Set<string>([
          ...correctKeysFromAnswer,
          ...correctKeysFromFlags
        ]);
  
        // 2) UNION of selected keys: current payload + prior snapshot + SelectedOptionService
        const selectedKeySet = new Set<string>();
  
        // current payload
        for (let i = 0; i < (options?.length ?? 0); i++) {
          const o: any = options[i];
          if (!o?.selected) continue;
          const k = (o?.optionId != null || o?.id != null)
            ? (idToKey.get(o?.optionId ?? o?.id) ?? keyOf(o, i))
            : keyOf(o, i);
          selectedKeySet.add(k);
        }
        // prior snapshot
        for (let i = 0; i < (priorSnap?.length ?? 0); i++) {
          const o: any = priorSnap[i];
          if (!o?.selected) continue;
          const k = (o?.optionId != null || o?.id != null)
            ? (idToKey.get(o?.optionId ?? o?.id) ?? keyOf(o, i))
            : keyOf(o, i);
          selectedKeySet.add(k);
        }
        // selectedOptionService
        try {
          const rawSel: any = this.selectedOptionService?.selectedOptionsMap?.get?.(index);
          if (rawSel instanceof Set) {
            rawSel.forEach((id: any) => { const k = idToKey.get(id); if (k) selectedKeySet.add(k); });
          } else if (Array.isArray(rawSel)) {
            rawSel.forEach((so: any, i2: number) => {
              const k = (so?.optionId != null || so?.id != null)
                ? (idToKey.get(so?.optionId ?? so?.id) ?? keyOf(so, i2))
                : keyOf(so, i2);
              selectedKeySet.add(k);
            });
          }
        } catch {}
  
        // 3) STICKY by correct keys (primary) OR fallback by any selected keys if no corrects are exposed
        const hasAuthoritativeCorrects = correctKeySet.size > 0;
  
        if (hasAuthoritativeCorrects) {
          // primary sticky: correct keys
          let stickyCorr = this.stickyCorrectIdsByIndex.get(index) as Set<string> | undefined;
          if (!stickyCorr) {
            stickyCorr = new Set<string>();
            // store Set<string> in same map (runtime-safe)
            this.stickyCorrectIdsByIndex.set(index, stickyCorr as unknown as Set<number | string>);
          }
          correctKeySet.forEach(k => { if (selectedKeySet.has(k)) (stickyCorr as Set<string>).add(k); });
  
          const totalForThisQ = expectedOverrideClick ?? correctKeySet.size;
          let q4Remaining     = Math.max(0, totalForThisQ - (stickyCorr as Set<string>).size);
  
          const prev = this.lastRemainingByIndex.get(index);
          let gateRemainingLocal =
            (typeof prev === 'number' && prev >= 0) ? Math.min(prev, q4Remaining) : q4Remaining;
  
          this.lastRemainingByIndex.set(index, gateRemainingLocal);
          gateRemaining = gateRemainingLocal;
        } else {
          // Fallback sticky: when authoring exposes NO corrects, gate by unique selections up to override
          let stickyAny = this.stickyAnySelectedKeysByIndex.get(index);
          if (!stickyAny) {
            stickyAny = new Set<string>();
            this.stickyAnySelectedKeysByIndex.set(index, stickyAny);
          }
          selectedKeySet.forEach(k => stickyAny!.add(k));
  
          const target = expectedOverrideClick ?? 0;
          let q4Remaining = Math.max(0, target - stickyAny.size);
  
          const prev = this.lastRemainingByIndex.get(index);
          let gateRemainingLocal =
            (typeof prev === 'number' && prev >= 0) ? Math.min(prev, q4Remaining) : q4Remaining;
  
          this.lastRemainingByIndex.set(index, gateRemainingLocal);
          gateRemaining = gateRemainingLocal;
  
          // Optional: warn once so you can fix content later
          if (target > 0) {
            console.warn('[Q4 tighten][fallback-any-selected] No authoring-corrects found; gating by selections.', {
              target, selectedKeys: [...selectedKeySet]
            });
          }
        }
      }
  
      if (gateRemaining > 0) {
        const msg = buildRemainingMsg(gateRemaining);
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
  
      // remaining === 0 → legit Next/Results immediately
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
    const cur = this.selectionMessageSubject.getValue();
    if (cur !== singleMsg) this.selectionMessageSubject.next(singleMsg);
  
    const now  = performance.now();
    const hold = now + 300;
    this.suppressPassiveUntil.set(index, hold);
    this.freezeNextishUntil.set(index, hold);
  
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
      return;  // never emit Next while remaining>0
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
    const isMulti =
      qType === QuestionType.MultipleAnswer ||
      ((expectedOverride ?? 0) > 1) ||
      (overlaid.filter(o => !!o?.correct).length > 1);

    if (!isMulti) return null;

    // Total required: prefer explicit override, else canonical count
    const totalCorrectCanonical = overlaid.filter(o => !!o?.correct).length;
    const totalForThisQ = (expectedOverride ?? totalCorrectCanonical);

    // Count only the selected CORRECT options
    const selectedCorrect = overlaid.reduce(
      (n, o) => n + ((!!o?.correct && !!o?.selected) ? 1 : 0), 0
    );

    const remaining = Math.max(0, totalForThisQ - selectedCorrect);
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
  private ensureStableIds(index: number, canonical: Option[] | null | undefined, ...uiLists: (Option[] | null | undefined)[]): void {
    const canon = Array.isArray(canonical) ? canonical : [];
    if (!canon.length) return;

    // Build or reuse mapping for this question
    let fwd = this.idMapByIndex.get(index);
    if (!fwd) {
      fwd = new Map();
      // seed from canonical
      canon.forEach((c, i) => {
        const key = this.keyOf(c);
        const cid = (c as any).optionId ?? (c as any).id ?? `q${index}o${i}`;
        (c as any).optionId = cid;  // stamp canonical
        fwd!.set(key, cid);
      });
      this.idMapByIndex.set(index, fwd);
    } else {
      // Make sure canonical is stamped if we created map earlier
      canon.forEach((c, i) => {
        const key = this.keyOf(c);
        let cid = fwd!.get(key);
        if (cid == null) {
          cid = (c as any).optionId ?? (c as any).id ?? `q${index}o${i}`;
          fwd!.set(key, cid);
        }
        (c as any).optionId = cid;
      });
    }
    // Stamp ids onto any UI lists using their keys
    for (const list of uiLists) {
      if (!Array.isArray(list)) continue;
      list.forEach((o) => {
        const key = this.keyOf(o as any);
        const cid = fwd!.get(key);
        if (cid != null) (o as any).optionId = cid;
      });
    }
  }

  public setExpectedCorrectCount(index: number, count: number): void {
    if (Number.isInteger(index) && index >= 0 && Number.isFinite(count) && count > 0) {
      this.expectedCorrectByIndex.set(index, count);
    }
  }
  
  public getExpectedCorrectCount(index: number): number | undefined {
    const n = this.expectedCorrectByIndex.get(index);
    return (typeof n === 'number' && n > 0) ? n : undefined;
  }

  // Resolve the set of correct option IDs for a question.
  // Prefer metadata (q.answer) and fall back to canonical `correct` flags.
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

    // 1) Prefer explicit answer metadata if present
    const ans: any = (q as any)?.answer;
    if (Array.isArray(ans) && ans.length) {
      // Build quick lookups for value/text
      const norm = (x: any) => String(x ?? '').trim().toLowerCase();
      for (let i = 0; i < canonical.length; i++) {
        const c = canonical[i] as any;
        const cid = c.optionId ?? c.id ?? i;
        const val = norm(c.value);
        const txt = norm(c.text ?? c.label);

        const matched = ans.some((a: any) => {
          if (a == null) return false;
          // direct id / optionId
          if (a === cid || a === c.id) return true;
          // tolerant string match on value/text
          const s = norm(a);
          return (s && (s === val || s === txt));
        });

        if (matched) ids.add(cid);
      }
    }

    // 2) Fallback to canonical `correct` flags
    if (ids.size === 0) {
      for (let i = 0; i < canonical.length; i++) {
        const c = canonical[i] as any;
        if (c?.correct) ids.add(c.optionId ?? c.id ?? i);
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
}