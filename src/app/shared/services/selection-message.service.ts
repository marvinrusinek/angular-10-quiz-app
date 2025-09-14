import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { CanonicalOption } from '../../shared/models/CanonicalOption.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

const START_MSG = 'Please start the quiz by selecting an option.';
const CONTINUE_MSG = 'Please select an option to continue...';
const NEXT_BTN_MSG = 'Please click the next button to continue...';
const SHOW_RESULTS_MSG = 'Please click the Show Results button.';
const buildRemainingMsg = (remaining: number) =>
  `Select ${remaining} more correct answer${ remaining === 1 ? '' : 's' } to continue...`;

interface OptionSnapshot {
  id: number | string;
  selected: boolean;
  correct?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SelectionMessageService {
  private selectionMessageSubject = new BehaviorSubject<string>(START_MSG);
  public readonly selectionMessage$: Observable<string> =
    this.selectionMessageSubject.pipe(distinctUntilChanged());

  public optionsSnapshot: Option[] = [];
  private optionsSnapshotSubject = new BehaviorSubject<Option[]>([]);
  latestOptionsSnapshot: ReadonlyArray<OptionSnapshot> | null = null;
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
  private expectedCorrectByQid = new Map<string | number, number>();

  // Tracks selected-correct option ids per question (survives wrong clicks)
  public stickyCorrectIdsByIndex = new Map<number, Set<number | string>>();
  public stickyAnySelectedKeysByIndex = new Map<number, Set<string>>();  // fallback store

  private observedCorrectIds = new Map<number, Set<string>>();

  // Latch to prevent regressions after a multi question is satisfied
  public completedByIndex = new Map<number, boolean>();

  // Track which questions have been "locked" once correct is chosen
  // Single-answer: one for incorrect, one for correct
  public _singleAnswerIncorrectLock: Set<number> = new Set();
  public _singleAnswerCorrectLock: Set<number> = new Set();

  // Multi-answer: one for "in-progress" (partial selections), 
  // one for "completion" (all correct selected)
  private _multiAnswerInProgressLock: Set<number> = new Set();
  private _multiAnswerCompletionLock: Set<number> = new Set();

  private _singleAnswerState = new Map<number, 'incorrect' | 'correct'>();  // per-question SA state

  private _multiAnswerLock = new Set<number>();
  private _multiAnswerPreLock = new Set<number>();

  // Track first incorrect clicks on single-answer questions
  private _firstClickIncorrectGuard: Set<number> = new Set<number>();

  private _origNext = this.selectionMessageSubject.next.bind(this.selectionMessageSubject);

  private _lastMessageByIndex = new Map<number, string>();

  private _msgRAF: number | null = null;

  constructor(
    private quizService: QuizService,
    private selectedOptionService: SelectedOptionService
  ) {
    this.selectionMessageSubject.next = (value: string) => {
      console.warn('[Intercepted .next()]', value);
      this._origNext(value);
    };
  }

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
  
    // ───────── ENTRY DEBUG LOG ─────────
    console.log('[determineSelectionMessage ENTRY]', {
      questionIndex,
      totalQuestions,
      snapshotSize: uiSnapshot?.length,
      latestSnapshot: (uiSnapshot ?? []).map(o => ({
        text: o.text,
        correct: o.correct,
        selected: o.selected
      }))
    });
  
    // ───────── GUARD: prevent empty snapshots from breaking flow ─────────
    if (!uiSnapshot || uiSnapshot.length === 0) {
      console.warn('[determineSelectionMessage] ⚠️ Empty snapshot → return baseline', {
        questionIndex,
        totalQuestions
      });
      // Always return a safe baseline so we don’t feed [] into computeFinalMessage
      return questionIndex === 0 ? START_MSG : CONTINUE_MSG;
    }
  
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
    const rawSel = this.selectedOptionService?.selectedOptionsMap?.get(questionIndex);
    const extraKeys = this.collectSelectedKeys(rawSel, keyOf);
    extraKeys.forEach(k => selectedKeys.add(k));
  
    // Ensure canonical and UI snapshot share the same optionId space, enriching snapshot with canonical fields like text
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
  
    console.log('[determineSelectionMessage] → calling computeFinalMessage', {
      questionIndex,
      qType,
      overlaid: overlaid.map(o => ({
        text: o.text,
        correct: o.correct,
        selected: o.selected
      }))
    });
  
    return this.computeFinalMessage({
      index: questionIndex,
      total: totalQuestions,
      qType,
      opts: overlaid
    });
  }
  
  

  // Centralized, deterministic message resolver (public entry point)
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;

    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some((o) => !!o?.selected);

    // ───────── BEFORE ANY PICK ─────────
    if (!anySelected) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }

    // ───────── AFTER A PICK ─────────
    let computedMsg = '';
    this.emitFromClick({
      index,
      totalQuestions: total,
      questionType: qType,
      options: opts,
      canonicalOptions: opts as CanonicalOption[],  // align types
      onMessageChange: (m: string) => (computedMsg = m),
      token: -1
    });

    // Safety fallback: if emitFromClick didn’t set anything
    if (!computedMsg) {
      computedMsg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }

    return computedMsg;
  } */
  // Centralized, deterministic message builder
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;

    // ───────── LOCKS ALWAYS WIN ─────────
    if (this._multiAnswerCompletionLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._singleAnswerCorrectLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._singleAnswerIncorrectLock.has(index)) {
      return 'Select a correct answer to continue...';
    }

    // ───────── BEFORE ANY PICK ─────────
    const anySelected = (opts ?? []).some(o => !!o?.selected);
    if (!anySelected) {
      if (qType === QuestionType.MultipleAnswer) {
        // Canonical correct count is the only truth here
        const correctCount = (opts ?? []).filter(o => !!o?.correct).length;
        return `Select ${correctCount} correct answer${correctCount > 1 ? 's' : ''} to continue...`;
      }
      // Single-answer → use start/continue copy
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }

    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const correctCount = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.correct && o.selected).length;
      const remaining = Math.max(0, correctCount - selectedCorrect);

      if (remaining > 0) {
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }

      // Lock once all correct are chosen
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }

    // ───────── SINGLE-ANSWER ─────────
    const lastPick = (opts ?? []).find(o => o.selected);

    if (lastPick?.correct) {
      this._singleAnswerCorrectLock.add(index);
      this._singleAnswerIncorrectLock.delete(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }

    if (lastPick && !lastPick.correct) {
      this._singleAnswerIncorrectLock.add(index);
      return 'Select a correct answer to continue...';
    }

    // Fallback
    return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
  } */
  // Central, deterministic message builder with lock enforcement
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      if (picked?.correct) {
        // ✅ Correct pick always overrides incorrect
        this._singleAnswerIncorrectLock.delete(index);
        this._singleAnswerCorrectLock.add(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (this._singleAnswerCorrectLock.has(index)) {
        // Correct lock persists
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (this._singleAnswerIncorrectLock.has(index)) {
        // Incorrect lock persists until a correct pick happens
        return 'Select a correct answer to continue...';
      }
  
      if (picked && !picked.correct) {
        // 🚫 First incorrect → set lock
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // No pick yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      if (!anySelected) {
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      if (remaining > 0) {
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // Lock once all correct answers are picked
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Default fallback
    return NEXT_BTN_MSG;
  } */
  // Centralized, deterministic message builder
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      // ✅ Already locked correct → never downgrade
      if (this._singleAnswerCorrectLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 Already locked incorrect → enforce until correct is picked
      if (this._singleAnswerIncorrectLock.has(index)) {
        if (picked?.correct) {
          // Promote once to correct lock
          this._singleAnswerCorrectLock.add(index);
          this._singleAnswerIncorrectLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        return 'Select a correct answer to continue...';
      }
  
      // First incorrect pick → lock immediately
      if (picked && !picked.correct) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // First correct pick → lock immediately
      if (picked?.correct) {
        this._singleAnswerCorrectLock.add(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // No pick yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      // ✅ Completed and locked → never downgrade
      if (this._multiAnswerCompletionLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🟢 Pre-selection → always show "Select N correct answers..."
      if (!anySelected) {
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      // Still missing → enforce "Select N more..."
      if (remaining > 0) {
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // ✅ All correct picked → lock and stick
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Fallback
    return NEXT_BTN_MSG;
  } */
  // Centralized, deterministic message builder
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── HARD LOCK SHORT-CIRCUITS ─────────
    // If already locked, NEVER downgrade (fixes "click-off" issue).
    if (this._singleAnswerCorrectLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._singleAnswerIncorrectLock.has(index)) {
      return 'Select a correct answer to continue...';
    }
    if (this._multiAnswerCompletionLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._multiAnswerInProgressLock.has(index)) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
      return remaining > 0
        ? `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`
        : (isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG);
    }
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      if (picked?.correct) {
        // ✅ Correct pick → lock and never downgrade again
        this._singleAnswerCorrectLock.add(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (picked && !picked.correct) {
        // 🔒 First incorrect pick → lock
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // No pick yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      if (!anySelected) {
        // ✅ Pre-selection message shows expected total correct answers
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      if (remaining > 0) {
        // Lock "in progress" so it won’t downgrade later
        this._multiAnswerInProgressLock.add(index);
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // ✅ All correct selected → lock completion
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Fallback
    return NEXT_BTN_MSG;
  } */
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      // ✅ If already locked correct, never downgrade
      if (this._singleAnswerCorrectLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 If locked incorrect, enforce unless user has now chosen correct
      if (this._singleAnswerIncorrectLock.has(index)) {
        if (picked?.correct) {
          // Promote: correct overrides previous incorrect lock
          this._singleAnswerCorrectLock.add(index);
          this._singleAnswerIncorrectLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        return 'Select a correct answer to continue...';
      }
  
      // First pick cases
      if (picked?.correct) {
        this._singleAnswerCorrectLock.add(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      if (picked && !picked.correct) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // No pick yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      // ✅ If already locked complete, never downgrade
      if (this._multiAnswerCompletionLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 If locked in-progress, enforce until complete
      if (this._multiAnswerInProgressLock.has(index)) {
        if (remaining === 0) {
          // Promote: all correct chosen → lock completion
          this._multiAnswerCompletionLock.add(index);
          this._multiAnswerInProgressLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // No pick yet → show "Select N correct answers…"
      if (!anySelected) {
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      // Some picks made
      if (remaining > 0) {
        // First time partial → lock in-progress
        this._multiAnswerInProgressLock.add(index);
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // All correct selected → lock complete
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Default fallback
    return NEXT_BTN_MSG;
  } */
  // Centralized, deterministic message builder
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      // ✅ Correct already locked → never downgrade
      if (this._singleAnswerCorrectLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 Incorrect already locked → enforce unless user has now chosen correct
      if (this._singleAnswerIncorrectLock.has(index)) {
        if (picked?.correct) {
          // Promote: correct overrides incorrect
          this._singleAnswerCorrectLock.add(index);
          this._singleAnswerIncorrectLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        // Even if nothing is picked anymore (click-off), stay locked to incorrect
        return 'Select a correct answer to continue...';
      }
  
      // First pick cases
      if (picked?.correct) {
        this._singleAnswerCorrectLock.add(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      if (picked && !picked.correct) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // No pick yet (fresh question, no clicks yet)
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      // ✅ Already locked complete → never downgrade
      if (this._multiAnswerCompletionLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 Already locked in-progress → enforce until complete
      if (this._multiAnswerInProgressLock.has(index)) {
        if (remaining === 0) {
          // Promote: all correct chosen → lock completion
          this._multiAnswerCompletionLock.add(index);
          this._multiAnswerInProgressLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // No pick yet → always stable "Select N correct answers…"
      if (!anySelected) {
        this._multiAnswerInProgressLock.add(index); // lock pre-selection state
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      // Some picks made
      if (remaining > 0) {
        // First time partial → lock in-progress
        this._multiAnswerInProgressLock.add(index);
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // All correct selected → lock complete
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Default fallback
    return NEXT_BTN_MSG;
  } */
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
    const anySelected = (opts ?? []).some(o => !!o?.selected);
  
    // ───────── LOCK ENFORCEMENT (runs before any recompute) ─────────
    if (this._singleAnswerCorrectLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._singleAnswerIncorrectLock.has(index)) {
      return 'Select a correct answer to continue...';
    }
    if (this._multiAnswerCompletionLock.has(index)) {
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
    if (this._multiAnswerInProgressLock.has(index)) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
      if (remaining === 0) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      const picked = (opts ?? []).find(o => !!o.selected);
  
      // ✅ Correct pick → lock correct and never downgrade
      if (picked?.correct) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index); // clear any wrong lock
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 First incorrect pick → lock
      if (picked && !picked.correct) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // No pick yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const totalCorrect = (opts ?? []).filter(o => !!o?.correct).length;
      const selectedCorrect = (opts ?? []).filter(o => o.selected && o.correct).length;
      const remaining = Math.max(0, totalCorrect - selectedCorrect);
  
      // ✅ Already locked complete → never downgrade
      if (this._multiAnswerCompletionLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔒 Already locked in-progress → enforce stable text until complete
      if (this._multiAnswerInProgressLock.has(index)) {
        if (remaining === 0) {
          this._multiAnswerCompletionLock.add(index);
          this._multiAnswerInProgressLock.delete(index);
          return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
        }
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // No pick yet → always stable "Select N correct answers..." message
      if (!anySelected) {
        this._multiAnswerInProgressLock.add(index);
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
  
      // Some picks made but not all correct yet
      if (remaining > 0) {
        this._multiAnswerInProgressLock.add(index);
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }
  
      // All correct selected → lock complete
      this._multiAnswerCompletionLock.add(index);
      return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
    }
  
    // Default fallback
    return NEXT_BTN_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    // ───────── GUARD: prevent flashing when options not ready ─────────
    if (!opts || opts.length === 0) {
      return this.selectionMessageSubject.getValue() ?? '';
    }
  
    const totalCorrect = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER (force wrong > correct precedence) ─────────
    if (qType === QuestionType.SingleAnswer) {
      console.log('[SingleAnswer DEBUG]', {
        selectedCorrect,
        selectedWrong,
        opts: opts.map(o => ({ text: o.text, selected: o.selected, correct: o.correct }))
      });
      // If any wrong is selected, force wrong message
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }

      // If correct lock already exists, or correct option is picked
      if (this._singleAnswerCorrectLock.has(index) || selectedCorrect > 0) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }

      // Persist wrong lock if it exists and no new correct chosen
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }

      // No picks yet
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }


    
    // ───────── MULTI-ANSWER (authoritative locks) ─────────
    if (qType === QuestionType.MultipleAnswer) {
      // ✅ Completion lock → always win
      if (this._multiAnswerCompletionLock.has(index)) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }

      // ✅ If pre-lock is active and no corrects picked yet → always win
      if (this._multiAnswerPreLock.has(index) && selectedCorrect === 0) {
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }

      // ✅ If in-progress lock is active → always win
      if (this._multiAnswerInProgressLock.has(index) && selectedCorrect < totalCorrect) {
        const remaining = totalCorrect - selectedCorrect;
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }

      // 🕐 No locks yet → set pre-lock
      if (selectedCorrect === 0) {
        this._multiAnswerPreLock.add(index);
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }

      // 🔄 Some corrects picked but not all → set in-progress lock
      if (selectedCorrect > 0 && selectedCorrect < totalCorrect) {
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.add(index);
        const remaining = totalCorrect - selectedCorrect;
        return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
      }

      // ✅ All correct picked → lock complete
      if (selectedCorrect === totalCorrect && totalCorrect > 0) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
    }


    // Default fallback
    return NEXT_BTN_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    console.log('[computeFinalMessage INPUT]', { 
      index, qType, 
      opts: (opts ?? []).map(o => ({ text: o.text, correct: o.correct, selected: o.selected }))
    });
  
    // ───────── EXTRA GUARD: prevent empty snapshots from flashing ─────────
    if (!opts || opts.length === 0) {
      console.warn('[computeFinalMessage] ⚠️ Empty opts received → baseline fallback', {
        index, total
      });
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER (sticky locks) ─────────
    console.log('[computeFinalMessage INPUT]', { 
      index, qType, 
      opts: (opts ?? []).map(o => ({
        text: o.text,
        correct: o.correct,
        selected: o.selected
      }))
    });

    if (qType === QuestionType.SingleAnswer) {
      console.log('[SingleAnswer DEBUG]', {
        index,
        totalCorrect,
        selectedCorrect,
        selectedWrong,
        hasCorrectLock: this._singleAnswerCorrectLock.has(index),
        hasWrongLock: this._singleAnswerIncorrectLock.has(index),
        isLast
      });

      // ✅ If wrong lock is already active → never promote to NEXT
      if (this._singleAnswerIncorrectLock.has(index)) {
        console.log('[SingleAnswer ❌ Wrong lock holds → force "Select a correct answer..." ]');
        return 'Select a correct answer to continue...';
      }

      // ✅ Correct → lock forever, clears wrong lock
      console.log('[SingleAnswer CHECK → before branch]', { selectedCorrect, selectedWrong, opts });
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        console.log('[SingleAnswer ✅ Correct branch HIT!]', {
          index,
          selectedCorrect,
          optsSnapshot: opts.map(o => ({
            text: o.text,
            correct: o.correct,
            selected: o.selected
          }))
        });

        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index); // correct overrides wrong

        const msg = isLast
          ? SHOW_RESULTS_MSG
          : NEXT_BTN_MSG;

        this.pushMessage(msg, index);
        return msg;
      }

      // ❌ Wrong → once set, persist until overridden
      if (selectedWrong > 0) {
        console.log('[SingleAnswer ❌ Wrong branch → lock + "Select a correct answer..." ]');
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }

      // None picked, no locks
      console.log('[SingleAnswer ⏸ None picked → baseline message]');
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER (stable pre-lock + progress) ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      // 🛡️ Sticky baseline
      if (selectedCorrect === 0) {
        this._multiAnswerPreLock.add(index);
        this._multiAnswerInProgressLock.delete(index);
        this._multiAnswerCompletionLock.delete(index);
        return baselineMsg; // 🚨 ONLY baseline
      }
  
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    return CONTINUE_MSG;    
    
    // ───────── Default Fallback ─────────
    console.warn('[computeFinalMessage] ⚠️ Default fallback hit', { index, qType });
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    console.log('[computeFinalMessage INPUT]', { 
      index, qType, 
      opts: (opts ?? []).map(o => ({ text: o.text, correct: o.correct, selected: o.selected }))
    });
  
    // ───────── EXTRA GUARD: prevent empty snapshots from flashing ─────────
    if (!opts || opts.length === 0) {
      // If multi-answer pre-lock exists, keep its baseline
      if (this._multiAnswerPreLock.has(index)) {
        const totalCorrect = this.quizService.questions?.[index]?.options?.filter(o => !!o.correct).length ?? 0;
        const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
        console.log('[computeFinalMessage] ⚠️ Empty opts but pre-lock active → baseline preserved', { index, baselineMsg });
        return baselineMsg;
      }
  
      console.warn('[computeFinalMessage] ⚠️ Empty opts received → skip message (return empty)', {
        index, total
      });
      return ''; // 🚫 don’t return CONTINUE_MSG or START_MSG here
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER (sticky locks) ─────────
    if (qType === QuestionType.SingleAnswer) {
      // ✅ Wrong lock → force correct-answer prompt
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
  
      // ✅ Correct lock or selected correct → NEXT/RESULTS
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
  
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // ❌ Wrong selected → persist until overridden
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
  
      // None picked → baseline
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER (sticky pre-lock + progress) ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
    
      // 🛡️ HARD BASELINE: if none selected → baseline only, no fallbacks allowed
      if (selectedCorrect === 0) {
        if (!this._multiAnswerPreLock.has(index)) {
          console.log('[MultiAnswer] Activating sticky baseline', { index, baselineMsg });
          this._multiAnswerPreLock.add(index);
          this._multiAnswerInProgressLock.delete(index);
          this._multiAnswerCompletionLock.delete(index);
        }
        return baselineMsg; // 🚨 baseline only
      }
    
      // ✅ All correct picked → NEXT or RESULTS
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
    
      // 🔄 Some correct but not all
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
    
  
    // ───────── Default Fallback ─────────
    // return NEXT_BTN_MSG;  // never CONTINUE_MSG for multi-answer
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    // ───────── GUARD: prevent empty snapshots from flashing ─────────
    if (!opts || opts.length === 0) {
      console.warn('[computeFinalMessage] ⚠️ Empty opts received → baseline fallback', {
        index, total
      });
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;

    // ───────── SINGLE-ANSWER (unchanged) ─────────
    if (qType === QuestionType.SingleAnswer) {
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      // 🛡️ Pre-selection: sticky, CONTINUE_MSG never allowed
      if (selectedCorrect === 0) {
        this._multiAnswerPreLock.add(index);
        this._multiAnswerInProgressLock.delete(index);
        this._multiAnswerCompletionLock.delete(index);
        return baselineMsg;
      }
  
      // ✅ All correct picked → NEXT or RESULTS
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      // 🔄 Some correct but not all
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }

    // ───────── Default fallback ─────────
    // return index === 0 ? START_MSG : CONTINUE_MSG;
    return NEXT_BTN_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    // ───────── EXTRA GUARD: prevent empty snapshots from flashing ─────────
    if (!opts || opts.length === 0) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER (sticky locks) ─────────
    if (qType === QuestionType.SingleAnswer) {
      // 🛡️ Sticky baseline until *any* click happens
      if (selectedCorrect === 0 && selectedWrong === 0 && 
          !this._singleAnswerCorrectLock.has(index) && 
          !this._singleAnswerIncorrectLock.has(index)) {
        return index === 0 ? START_MSG : CONTINUE_MSG;  // 🚫 block CONTINUE_MSG flicker
      }
  
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
  
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
    }
  
    // ───────── MULTI-ANSWER (sticky baseline + progress) ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      // 🛡️ HARD BASELINE: if none selected, baseline only
      if (selectedCorrect === 0 && !this._multiAnswerCompletionLock.has(index)) {
        this._multiAnswerPreLock.add(index);
        this._multiAnswerInProgressLock.delete(index);
        return baselineMsg;  // 🚫 never allow CONTINUE_MSG here
      }
  
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── Default Fallback ─────────
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    if (!opts || opts.length === 0) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER (sticky baseline) ─────────
    if (qType === QuestionType.SingleAnswer) {
      // 🛡️ Force START/CONTINUE baseline until *first click*
      if (
        selectedCorrect === 0 &&
        selectedWrong === 0 &&
        !this._singleAnswerCorrectLock.has(index) &&
        !this._singleAnswerIncorrectLock.has(index)
      ) {
        return index === 0 ? START_MSG : CONTINUE_MSG;
      }
  
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
  
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
    }
  
    // ───────── MULTI-ANSWER (sticky baseline) ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      // 🛡️ Force baseline until at least one correct is chosen
      if (selectedCorrect === 0 && !this._multiAnswerInProgressLock.has(index)) {
        this._multiAnswerPreLock.add(index);
        return baselineMsg;
      }
  
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── Default Fallback ─────────
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  /* public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    if (!opts || opts.length === 0) {
      // 🚫 IMPORTANT: Don’t allow CONTINUE for MultiAnswer baseline
      if (qType === QuestionType.MultipleAnswer) {
        const totalCorrect = this.quizService.questions?.[index]?.options?.filter(o => o.correct).length ?? 0;
        return `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      }
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      if (selectedCorrect === 0 && selectedWrong === 0) {
        // Stick baseline until user clicks
        return index === 0 ? START_MSG : CONTINUE_MSG;
      }
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      if (selectedCorrect === 0) {
        // Force baseline always, no CONTINUE allowed
        return baselineMsg;
      }
      if (selectedCorrect === totalCorrect) {
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
      const remaining = totalCorrect - selectedCorrect;
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── Fallback ─────────
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  /* public computeFinalMessage(args: {
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    if (!opts || opts.length === 0) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      // 🛡 baseline until first click
      if (selectedCorrect === 0 && selectedWrong === 0 &&
          !this._singleAnswerCorrectLock.has(index) &&
          !this._singleAnswerIncorrectLock.has(index)) {
        return index === 0 ? START_MSG : CONTINUE_MSG;
      }
  
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
  
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      // 🛡 baseline only until first correct is chosen
      if (selectedCorrect === 0) {
        this._multiAnswerPreLock.add(index);
        this._multiAnswerInProgressLock.delete(index);
        this._multiAnswerCompletionLock.delete(index);
        return baselineMsg;   // 🚨 never CONTINUE_MSG here
      }
  
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── Default Fallback ─────────
    return index === 0 ? START_MSG : CONTINUE_MSG;
  } */
  public computeFinalMessage(args: {  
    index: number;
    total: number;
    qType: QuestionType;
    opts: Option[];
  }): string {
    const { index, total, qType, opts } = args;
    const isLast = total > 0 && index === total - 1;
  
    if (!opts || opts.length === 0) {
      return index === 0 ? START_MSG : CONTINUE_MSG;
    }
  
    const totalCorrect    = opts.filter(o => !!o?.correct).length;
    const selectedCorrect = opts.filter(o => o.selected && o.correct).length;
    const selectedWrong   = opts.filter(o => o.selected && !o.correct).length;
  
    // ───────── SINGLE-ANSWER ─────────
    if (qType === QuestionType.SingleAnswer) {
      // Baseline until any click
      if (selectedCorrect === 0 && selectedWrong === 0) {
        return index === 0 ? START_MSG : CONTINUE_MSG;
      }
  
      if (this._singleAnswerIncorrectLock.has(index)) {
        return 'Select a correct answer to continue...';
      }
  
      if (selectedCorrect > 0 || this._singleAnswerCorrectLock.has(index)) {
        this._singleAnswerCorrectLock.add(index);
        this._singleAnswerIncorrectLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      if (selectedWrong > 0) {
        this._singleAnswerIncorrectLock.add(index);
        return 'Select a correct answer to continue...';
      }
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (qType === QuestionType.MultipleAnswer) {
      const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
      if (selectedCorrect === 0) {
        this._multiAnswerPreLock.add(index);
        return baselineMsg; // sticky until first correct
      }
  
      if (selectedCorrect === totalCorrect) {
        this._multiAnswerCompletionLock.add(index);
        this._multiAnswerPreLock.delete(index);
        this._multiAnswerInProgressLock.delete(index);
        return isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
  
      const remaining = totalCorrect - selectedCorrect;
      this._multiAnswerPreLock.delete(index);
      this._multiAnswerInProgressLock.add(index);
      return `Select ${remaining} more correct answer${remaining > 1 ? 's' : ''} to continue...`;
    }
  
    // ───────── Default fallback ─────────
    return index === 0 ? START_MSG : CONTINUE_MSG;
  }
  
  
    
  public pushMessage(newMsg: string, i0: number): void {
    const current = this.selectionMessageSubject.getValue();
  
    // ───────── FINAL GUARD AGAINST FLICKER ─────────
    const qType: QuestionType | undefined =
      (this.quizService.questions?.[i0]?.type as QuestionType | undefined) ?? undefined;
  
    const totalCorrect = this.optionsSnapshot?.filter(o => !!o.correct).length ?? 0;
    const selectedCorrect = this.optionsSnapshot?.filter(o => o.selected && o.correct).length ?? 0;
    const selectedWrong = this.optionsSnapshot?.filter(o => o.selected && !o.correct).length ?? 0;
  
    // 🛡️ Guard 1: Multi-answer baseline → always stick until at least one correct is chosen
    if (qType === QuestionType.MultipleAnswer && selectedCorrect === 0) {
      newMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      console.log('[pushMessage Guard] Forced multi-answer baseline', { i0, newMsg });
    }
  
    // 🛡️ Guard 2: Single-answer baseline → always stick until first click
    if (
      qType === QuestionType.SingleAnswer &&
      selectedCorrect === 0 &&
      selectedWrong === 0 &&
      !this._singleAnswerCorrectLock.has(i0) &&
      !this._singleAnswerIncorrectLock.has(i0)
    ) {
      newMsg = i0 === 0 ? START_MSG : CONTINUE_MSG;
      console.log('[pushMessage Guard] Forced single-answer baseline', { i0, newMsg });
    }
  
    // 🛡️ Guard 3: prevent false NEXT promotion while wrong lock is active
    if (newMsg === NEXT_BTN_MSG && this._singleAnswerIncorrectLock.has(i0)) {
      console.warn('[Guard] Prevented false promotion to NEXT (Q', i0, ')');
      return;
    }
  
    // 🛡️ Guard 4: prevent CONTINUE_MSG overwrite during multi-answer baseline
    if (
      qType === QuestionType.MultipleAnswer &&
      this._multiAnswerPreLock.has(i0) &&
      newMsg === CONTINUE_MSG
    ) {
      console.warn('[Guard] Prevented CONTINUE_MSG override during multi-answer baseline (Q', i0, ')');
      return;
    }
  
    // 🛡️ Guard 5: prevent duplicate baseline re-push for single-answer
    if (
      qType === QuestionType.SingleAnswer &&
      (newMsg === CONTINUE_MSG || newMsg === START_MSG) &&
      current === newMsg
    ) {
      console.log('[Guard] Skipped duplicate baseline for single-answer (Q', i0, ')');
      return;
    }
  
    // 🚫 Guard 6: don’t push duplicate messages
    if (current === newMsg) {
      return;
    }
  
    // ✅ Final push
    this.selectionMessageSubject.next(newMsg);
    console.log('[pushMessage] updated:', newMsg);
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

  /* public async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const i0 = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
      if (typeof i0 !== 'number' || isNaN(i0) || total <= 0) return;
  
      if (!this.optionsSnapshot || this.optionsSnapshot.length === 0) return;
  
      // Safely get question type
      const qType: QuestionType | undefined =
        (this.quizService.questions?.[i0]?.type as QuestionType | undefined) ?? undefined;
  
      // ───────── HARD GUARD: Multi-answer sticky baseline ─────────
      if (qType === QuestionType.MultipleAnswer) {
        const totalCorrect = this.optionsSnapshot.filter(o => !!o.correct).length;
        const selectedCorrect = this.optionsSnapshot.filter(o => o.selected && o.correct).length;
  
        if (selectedCorrect === 0) {
          const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
  
          const prevMsg = this._lastMessageByIndex.get(i0);
          if (prevMsg !== baselineMsg) {
            console.log('[Guard] Sticky baseline enforced (multi-answer)', { i0, baselineMsg });
            this._lastMessageByIndex.set(i0, baselineMsg);
            this.pushMessage(baselineMsg, i0);
          }
          return; // 🚨 bail early, never call determineSelectionMessage
        }
      }
  
      // ───────── HARD GUARD: Single-answer baseline ─────────
      if (qType === QuestionType.SingleAnswer) {
        const selectedCorrect = this.optionsSnapshot.filter(o => o.selected && o.correct).length;
        const selectedWrong   = this.optionsSnapshot.filter(o => o.selected && !o.correct).length;
  
        if (selectedCorrect === 0 && selectedWrong === 0) {
          const baselineMsg = i0 === 0 ? START_MSG : CONTINUE_MSG;
  
          const prevMsg = this._lastMessageByIndex.get(i0);
          if (prevMsg !== baselineMsg) {
            console.log('[Guard] Sticky baseline enforced (single-answer)', { i0, baselineMsg });
            this._lastMessageByIndex.set(i0, baselineMsg);
            this.pushMessage(baselineMsg, i0);
          }
          return; // 🚨 bail early, no determineSelectionMessage call
        }
      }
  
      // ───────── Normal path continues only if no baseline guard triggered ─────────
      queueMicrotask(() => {
        const finalMsg = this.determineSelectionMessage(i0, total, isAnswered);
  
        // Guard: don’t push duplicates
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg === finalMsg) return;
  
        this._lastMessageByIndex.set(i0, finalMsg);
        this.pushMessage(finalMsg, i0);
      });
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  } */
  /* public async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const i0 = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
      if (typeof i0 !== 'number' || isNaN(i0) || total <= 0) return;
  
      if (!this.optionsSnapshot || this.optionsSnapshot.length === 0) return;
  
      // Safely get question type
      const qType: QuestionType | undefined =
        (this.quizService.questions?.[i0]?.type as QuestionType | undefined) ?? undefined;
  
      const totalCorrect = this.optionsSnapshot.filter(o => !!o.correct).length;
      const selectedCorrect = this.optionsSnapshot.filter(o => o.selected && o.correct).length;
      const selectedWrong = this.optionsSnapshot.filter(o => o.selected && !o.correct).length;
  
      // 🛡️ EARLY BASELINE GUARDS — bail out completely so CONTINUE/“select option” never queues
  
      // Multi-answer baseline
      if (qType === QuestionType.MultipleAnswer && selectedCorrect === 0) {
        const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg !== baselineMsg) {
          this._lastMessageByIndex.set(i0, baselineMsg);
          this.pushMessage(baselineMsg, i0);
        }
        return; // 🚨 stop here, don’t call determineSelectionMessage
      }
  
      // Single-answer baseline
      if (
        qType === QuestionType.SingleAnswer &&
        selectedCorrect === 0 &&
        selectedWrong === 0 &&
        !this._singleAnswerCorrectLock.has(i0) &&
        !this._singleAnswerIncorrectLock.has(i0)
      ) {
        const baseline = i0 === 0 ? START_MSG : CONTINUE_MSG;
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg !== baseline) {
          this._lastMessageByIndex.set(i0, baseline);
          this.pushMessage(baseline, i0);
        }
        return; // 🚨 stop here, don’t call determineSelectionMessage
      }
  
      // Normal path (only runs once baseline is broken)
      queueMicrotask(() => {
        const finalMsg = this.determineSelectionMessage(i0, total, isAnswered);
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg === finalMsg) return;
  
        this._lastMessageByIndex.set(i0, finalMsg);
        this.pushMessage(finalMsg, i0);
      });
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  } */
  public async setSelectionMessage(isAnswered: boolean): Promise<void> {
    try {
      const i0 = this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
      if (typeof i0 !== 'number' || isNaN(i0) || total <= 0) return;
  
      if (!this.optionsSnapshot || this.optionsSnapshot.length === 0) return;
  
      const qType: QuestionType | undefined =
        (this.quizService.questions?.[i0]?.type as QuestionType | undefined) ?? undefined;
  
      const totalCorrect = this.optionsSnapshot.filter(o => !!o.correct).length;
      const selectedCorrect = this.optionsSnapshot.filter(o => o.selected && o.correct).length;
      const selectedWrong = this.optionsSnapshot.filter(o => o.selected && !o.correct).length;
  
      // ───────── MULTI-ANSWER baseline guard ─────────
      if (qType === QuestionType.MultipleAnswer && selectedCorrect === 0) {
        const baselineMsg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg !== baselineMsg) {
          console.log('[Guard] Forcing sticky multi-answer baseline', { i0, baselineMsg });
          this._lastMessageByIndex.set(i0, baselineMsg);
          this.pushMessage(baselineMsg, i0);
        }
        return; // 🚨 bail completely: do NOT schedule determineSelectionMessage
      }
  
      // ───────── SINGLE-ANSWER baseline guard ─────────
      if (
        qType === QuestionType.SingleAnswer &&
        selectedCorrect === 0 &&
        selectedWrong === 0 &&
        !this._singleAnswerCorrectLock.has(i0) &&
        !this._singleAnswerIncorrectLock.has(i0)
      ) {
        const baseline = i0 === 0 ? START_MSG : CONTINUE_MSG;
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg !== baseline) {
          console.log('[Guard] Forcing sticky single-answer baseline', { i0, baseline });
          this._lastMessageByIndex.set(i0, baseline);
          this.pushMessage(baseline, i0);
        }
        return; // 🚨 bail completely
      }
  
      // ───────── Normal path ─────────
      queueMicrotask(() => {
        const finalMsg = this.determineSelectionMessage(i0, total, isAnswered);
        const prevMsg = this._lastMessageByIndex.get(i0);
        if (prevMsg === finalMsg) return;
        this._lastMessageByIndex.set(i0, finalMsg);
        this.pushMessage(finalMsg, i0);
      });
    } catch (err) {
      console.error('[❌ setSelectionMessage ERROR]', err);
    }
  }
  
  

  public clearSelectionMessage(): void {
    this.selectionMessageSubject.next('');
  }

  public updateSelectionMessage(
    message?: string,
    ctx?: { options?: Option[]; index?: number; token?: number; questionType?: QuestionType }
  ): void {
    try {
      const i0 = ctx?.index ?? this.quizService.currentQuestionIndex;
      const total = this.quizService.totalQuestions;
  
      // Reuse the unified pipeline
      const msg = this.determineSelectionMessage(i0, total, false);
  
      if (msg && this.selectionMessageSubject.getValue() !== msg) {
        this.selectionMessageSubject.next(msg);
      }
    } catch (err) {
      console.error('[❌ updateSelectionMessage ERROR]', err);
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
  }

  // Snapshot API
  // Writer: always store a cloned array so callers can’t mutate our state
  public setOptionsSnapshot(opts: Option[] | null | undefined): void {
    // Defensive clone so we never hold external refs
    const safe = Array.isArray(opts) ? opts.map((o) => ({ ...o })) : [];
    if (safe.length === 0) {
      console.warn('[setOptionsSnapshot] Ignored empty options snapshot');
      return;  // don’t overwrite with []
    }
  
    // Persist internally and notify observers
    this.optionsSnapshot = safe;
    this.optionsSnapshotSubject.next(safe);
  
    // Debug log of what was actually stored
    console.log('[setOptionsSnapshot]', safe.map(o => ({
      text: o.text,
      correct: o.correct,
      selected: o.selected
    })));
  }

  public notifySelectionMutated(options: Option[] | null | undefined): void {
    this.setOptionsSnapshot(options);  // keep existing snapshot
  }

  // HELPERS
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

  // Emit a selection message based on canonical + UI state
  /* public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
    canonicalOptions: CanonicalOption[];
    onMessageChange?: (msg: string) => void;
    token?: number;
  }): void {
    const {
      index,
      totalQuestions,
      questionType,
      options,
      canonicalOptions,
      onMessageChange,
    } = params;
  
    const isMultiSelect = questionType === QuestionType.MultipleAnswer;
    const isLast = index === totalQuestions - 1;
  
    const correctOpts = canonicalOptions.filter(o => !!o.correct);
    const selectedCorrectCount = correctOpts.filter(o => !!o.selected).length;
    const selectedCount = (options ?? []).filter(o => !!o.selected).length;
  
    let msg = '';
  
    // ───────── SINGLE-ANSWER INCORRECT LOCK ─────────
    if (!isMultiSelect && this._singleAnswerIncorrectLock.has(index)) {
      const picked = canonicalOptions.find(o => o.selected);
      if (picked?.correct) {
        // ✅ Unlock once a correct is picked
        this._singleAnswerIncorrectLock.delete(index);
        msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      } else {
        // 🔒 Stay locked regardless of further clicks or side-clicks
        msg = 'Select a correct answer to continue...';
      }
      if (onMessageChange) onMessageChange(msg);
      this.selectionMessageSubject?.next(msg);
      return; // lock always wins
    }
  
    // ───────── BEFORE ANY PICK ─────────
    if (!selectedCount) {
      if (isMultiSelect) {
        const totalCorrect = correctOpts.length;
        msg = `Select ${totalCorrect} correct answer${totalCorrect > 1 ? 's' : ''} to continue...`;
      } else {
        msg = index === 0 ? START_MSG : CONTINUE_MSG;
      }
      if (onMessageChange) onMessageChange(msg);
      this.selectionMessageSubject?.next(msg);
      return;
    }
  
    // ───────── MULTI-ANSWER ─────────
    if (isMultiSelect) {
      const remainingCorrect = Math.max(0, correctOpts.length - selectedCorrectCount);
  
      if (remainingCorrect > 0) {
        msg = `Select ${remainingCorrect} more correct answer${remainingCorrect > 1 ? 's' : ''} to continue...`;
      } else {
        // Once all correct are picked, lock it
        if (!this._multiAnswerCompletionLock.has(index)) {
          this._multiAnswerCompletionLock.add(index);
        }
        msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      }
    }
    // ───────── SINGLE-ANSWER ─────────
    else {
      const picked = canonicalOptions.find(o => o.selected);
      if (picked?.correct) {
        msg = isLast ? SHOW_RESULTS_MSG : NEXT_BTN_MSG;
      } else {
        // First incorrect → set lock and stay on it
        this._singleAnswerIncorrectLock.add(index);
        msg = 'Select a correct answer to continue...';
      }
    }
  
    if (onMessageChange) onMessageChange(msg);
    this.selectionMessageSubject?.next(msg);
  } */
  public emitFromClick(params: {
    index: number;
    totalQuestions: number;
    questionType: QuestionType;
    options: Option[];
    canonicalOptions: CanonicalOption[];
    onMessageChange?: (msg: string) => void;
    token?: number;
  }): void {
    const { index, totalQuestions, questionType, canonicalOptions, onMessageChange } = params;
  
    // Delegate all message building to computeFinalMessage
    const msg = this.computeFinalMessage({
      index,
      total: totalQuestions,
      qType: questionType,
      opts: canonicalOptions as Option[]
    });
  
    // Optional callback hook for caller
    if (onMessageChange) {
      onMessageChange(msg);
    }
  
    // Route through guarded writer
    this.pushMessage(msg, index);
  }

  /* ================= Helpers ================= */
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
          return this.toOption(o, idx, sel);  // always an Option
        })
      : source.map((o, idx) => this.toOption(o, idx));  // always an Option

    return result;  // Option[]
  }

  // Gate: if multi & remaining > 0, return the forced "Select N more..." message; else null
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

  // Ensure every canonical option has a stable optionId.
  // Also stamp matching ids onto any UI list passed in.
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
    // Exact index match
    const fromIndex = this.expectedCorrectByIndex.get(index);
    if (typeof fromIndex === 'number' && fromIndex > 0) return fromIndex;

    // Resolve the question object and try an id-based override
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

  // Map a single snapshot -> Option
  private mapSnapshotToOption(
    s: OptionSnapshot,
    lookup?: Map<string | number, Option>
  ): Option {
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

  // Returns a stable key for an option, to uniquely identify it across UI / canonical options.
  public stableKey(opt: Option, idx?: number): string {
    if (!opt) return `unknown-${idx ?? '0'}`;
    return opt.optionId != null
      ? String(opt.optionId)
      : `${String(opt.value ?? '')
          .trim()
          .toLowerCase()}|${String(opt.text ?? '')
          .trim()
          .toLowerCase()}`;
  }

  // Use the same stable-id logic everywhere
  private toStableId(o: any, idx?: number): number | string {
    // Prefer true stable ids if present
    if (o?.optionId != null) return o.optionId as number | string;
    if (o?.id != null) return o.id as number | string;
    if (o?.value != null) return o.value as number | string;

    // Derive from text if available (stable across renders)
    if (typeof o?.text === 'string' && o.text.trim().length) {
      return `t:${o.text}`; // prefix to avoid clashing with numeric ids
    }

    // Fall back to index if provided
    if (typeof idx === 'number') {
      return `i:${idx}`;
    }

    // Last-resort constant (still deterministic) – better than Math.random()
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
      // Required/expected fields
      optionId: optionId as any,
      text: typeof o?.text === 'string' ? o.text : '',
      correct: !!o?.correct,
      value: (o?.value ?? optionId) as any,
      selected,

      // Keep common optional flags consistent
      active: !!o?.active,
      highlight: typeof o?.highlight === 'boolean' ? o.highlight : selected,
      showIcon: typeof o?.showIcon === 'boolean' ? o.showIcon : selected,

      // Passthrough optionals with safe defaults
      answer: o?.answer,
      feedback: typeof o?.feedback === 'string' ? o.feedback : '',
      styleClass: typeof o?.styleClass === 'string' ? o.styleClass : '',
    } as Option;
  }

  private optionToSnapshot(o: Option, idx?: number): OptionSnapshot {
    return {
      id: this.toStableId(o, idx),
      selected: !!o.selected,
      correct: typeof o.correct === 'boolean' ? o.correct : undefined
    };
  }

  public getLatestOptionsSnapshotAsOptions(lookupFrom?: Option[]): Option[] {
    const snaps = this.getLatestOptionsSnapshot();  // OptionSnapshot[]
    return this.toOptionArrayWithLookup(snaps, lookupFrom);  // Option[]
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

  // Helper: normalize rawSel into a Set of keys
  private collectSelectedKeys(
    rawSel: Set<any> | any[] | undefined,
    keyOf: (o: any) => string | number
  ): Set<string | number> {
    const keys = new Set<string | number>();
    if (!rawSel) return keys;

    if (rawSel instanceof Set) {
      for (const sel of rawSel) {
        // sel might be a SelectedOption, so normalize to its optionId
        const id = (sel as any)?.optionId ?? sel;
        keys.add(id);
      }
    } else if (Array.isArray(rawSel)) {
      for (const so of rawSel) {
        keys.add(keyOf(so));
      }
    }

    return keys;
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
}