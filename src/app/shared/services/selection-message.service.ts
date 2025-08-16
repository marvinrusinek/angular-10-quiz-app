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
    const isMulti = (totalCorrect > 1) || (qTypeDeclared === QuestionType.MultipleAnswer);
  
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
    if (prevRem === undefined || remaining !== prevRem) {
      this.lastRemainingByIndex.set(i0, remaining);
      if (remaining > 0 && (prevRem === undefined || remaining < prevRem)) {
        this.enforceUntilByIndex.set(i0, now + 800);
      }
      if (remaining === 0) this.enforceUntilByIndex.delete(i0);
    }
  
    const enforceUntil = this.enforceUntilByIndex.get(i0) ?? 0;
    const inEnforce = now < enforceUntil;
  
    // ── MULTI HARD GUARD ─────────────────────────────────────────────
    // Always anchor to remaining correct picks. This means:
    // - After a correct → incorrect click, remaining stays >0,
    //   so we KEEP showing "Select 1 more correct option..." (no Next flash).
    if (isMulti) {
      if (remaining > 0 || inEnforce) {
        const forced = buildRemainingMsg(Math.max(1, remaining));
        if (current !== forced) this.selectionMessageSubject.next(forced);
        return; // never allow Next/Results until remaining === 0
      }
      const isLast = i0 === (this.quizService.totalQuestions - 1);
      const finalMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      if (current !== finalMsg) this.selectionMessageSubject.next(finalMsg);
      return;
    }
    // ────────────────────────────────────────────────────────────────
  
    // SINGLE → never allow "Select more..."; allow Next/Results when any selected
    const anySelected = (optsCtx ?? this.getLatestOptionsSnapshot()).some(o => !!o?.selected);
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

  // Index-aware resolver: NEVER reads currentQuestionIndex.
  // Resolve an option's stable id specifically for the given question index.
  private getOptionIdFor(index: number, opt: any, i: number): number | string {
    if (!opt) return '__nil';
    if (opt.optionId != null) return opt.optionId;
    if (opt.id != null) return opt.id;

    const key = this.keyOf(opt);
    const map = this.idMapByIndex.get(index);
    const mapped = map?.get(key);
    if (mapped != null) return mapped;

    // Last resort: namespace by question index so identical content on other questions won't collide
    return `q${index}~${key}~${i}`;
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
  
    // Normalize/stamp IDs for this question up front (prevents index drift on Q4)
    try {
      this.ensureStableIds(
        index,
        (this.quizService as any)?.currentQuestion?.options ?? [],
        options,
        this.getLatestOptionsSnapshot()
      );
    } catch {}
  
    // Snapshot (kept)
    this.setOptionsSnapshot(options);
  
    // --- Normalize IDs so canonical/UI share the same optionId space ---
    const svc: any = this.quizService as any;
    const qArr = Array.isArray(svc.questions) ? (svc.questions as QuizQuestion[]) : [];
    const q: QuizQuestion | undefined =
      (index >= 0 && index < qArr.length ? qArr[index] : undefined) ??
      (svc.currentQuestion as QuizQuestion | undefined);
  
    try {
      this.ensureStableIds(index, (q as any)?.options ?? [], options, this.getLatestOptionsSnapshot());
  
      // Stamp registry ids onto the clicked list
      const idMap = this.idMapByIndex.get(index);
      if (idMap) {
        for (const o of options) {
          const key = this.keyOf(o);
          const cid = idMap.get(key);
          if (cid != null) (o as any).optionId = cid;
        }
      }
    } catch {}
  
    // --- Build a CANONICAL OVERLAY (union of: ctx.options + snapshot + SelectedOptionService) ---
    const overlaid = this.getCanonicalOverlay(index, options);
  
    // --- Compute totals/remaining from the overlay (authoritative for gating) ---
    const totalCorrect = overlaid.filter(o => !!o?.correct).length;
    const selectedCorrect = overlaid.filter(o => !!o?.correct && !!o?.selected).length;
    const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
    // Decide multi from canonical data first; fall back to declared type
    const isMulti = (totalCorrect > 1) || (questionType === QuestionType.MultipleAnswer);
    const isLast = totalQuestions > 0 && index === totalQuestions - 1;
  
    // --- Now that we've computed correctly, snapshot the overlay for future passes ---
    this.setOptionsSnapshot(overlaid);
  
    // --- Decisive click behavior (with freeze to avoid flashes) ---
    if (isMulti) {
      if (remaining > 0) {
        const msg = buildRemainingMsg(remaining);  // e.g., "Select 1 more correct option..."
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
  
    // Stamp/normalize IDs for this question (no-op if already done)
    try { this.ensureStableIds(i0, canonical, optsCtx ?? this.getLatestOptionsSnapshot()); } catch {}
  
    // One true source of selected IDs
    const selectedIds = this.buildSelectedIdUnion(i0, optsCtx);
  
    // Overlay onto canonical using index-aware IDs
    return canonical.length
      ? canonical.map((o, idx) => {
          const cid = this.getOptionIdFor(i0, o, idx);
          return { ...o, selected: selectedIds.has(cid) };
        })
      : (Array.isArray(optsCtx) ? optsCtx.map(o => ({ ...o })) : this.getLatestOptionsSnapshot().map(o => ({ ...o })));
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
  
    // Freshly (re)stamp IDs for this question (prevents stale collisions on Q4)
    try { this.stampIdsFresh(index, canonical, uiOpts ?? this.getLatestOptionsSnapshot()); } catch {}
  
    // Build canonical id set for intersection
    const canonicalIds = new Set<number | string>();
    for (let i = 0; i < canonical.length; i++) {
      canonicalIds.add(this.getOptionIdFor(index, canonical[i], i));
    }
  
    // Unified selected IDs (index-aware)
    const selectedIds = this.buildSelectedIdUnion(index, uiOpts);
  
    // ⚠️ Intersect: ignore any ids not in this question's canonical set
    for (const id of Array.from(selectedIds)) {
      if (!canonicalIds.has(id)) selectedIds.delete(id);
    }
  
    // Count using canonical correctness + intersected IDs
    let totalCorrect = 0;
    let selectedCorrect = 0;
    for (let i = 0; i < canonical.length; i++) {
      const c = canonical[i];
      if (!c?.correct) continue;
      totalCorrect++;
      const id = this.getOptionIdFor(index, c, i);
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
  private ensureStableIds(
    index: number,
    canonical: Option[] | null | undefined,
    ...uiLists: (Option[] | null | undefined)[]
  ): void {
    const canon = Array.isArray(canonical) ? canonical : [];
    if (!canon.length) return;
  
    // 1) Ensure every canonical option has a unique optionId
    let idMap = this.idMapByIndex.get(index);
    if (!idMap) {
      idMap = new Map<string, string | number>();
      this.idMapByIndex.set(index, idMap);
    }
  
    // Build buckets of canonical IDs per content key (handles duplicates)
    const buckets = new Map<string, Array<string | number>>();
  
    canon.forEach((c, i) => {
      // stamp a stable id if missing
      const cid = (c as any).optionId ?? (c as any).id ?? `q${index}o${i}`;
      (c as any).optionId = cid;
  
      const ck = this.contentKey(c);
      // record a 1:1 mapping only for singletons (optional, harmless to keep)
      if (!idMap!.has(ck)) idMap!.set(ck, cid);
  
      // push into bucket (so duplicates get distinct, ordered IDs)
      const arr = buckets.get(ck) ?? [];
      arr.push(cid);
      buckets.set(ck, arr);
    });
  
    // 2) Stamp IDs onto any UI lists, consuming from the buckets in order
    for (const list of uiLists) {
      if (!Array.isArray(list)) continue;
  
      // If any item already has optionId, keep it; else assign from bucket by content
      for (const o of list) {
        if ((o as any)?.optionId != null) continue; // already stamped
        const ck = this.contentKey(o);
        const arr = buckets.get(ck);
        if (arr && arr.length) {
          const cid = arr.shift()!;                // take next available canonical id for this content
          (o as any).optionId = cid;
        } else {
          // Fallback: if no canonical match, synthesize a stable per-item id
          // (rare: e.g., UI has extra option not in canonical)
          (o as any).optionId = `q${index}-ui-${ck}-${Math.random().toString(36).slice(2,7)}`;
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
}