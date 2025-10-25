import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { filter, map, take, timeout } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { QuestionType } from '../../shared/models/question-type.enum';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

export interface ExplanationEvent {
  index: number,
  text: string | null
}

@Injectable({ providedIn: 'root' })
export class ExplanationTextService {
  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanation$ = this.explanationTextSubject.asObservable();

  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>('');
  explanationTexts: Record<number, string> = {};

  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  formattedExplanationSubject = new BehaviorSubject<string | null>(null);
  formattedExplanation$: Observable<string> =
    this.formattedExplanationSubject.asObservable();
  private formattedExplanationByQuestionText = new Map<string, string>();

  private readonly globalContextKey = 'global';
  private explanationByContext = new Map<string, string>();
  private shouldDisplayByContext = new Map<string, boolean>();
  private displayedByContext = new Map<string, boolean>();

  private explanationsUpdated = new BehaviorSubject<
    Record<number, FormattedExplanation>
  >(this.formattedExplanations);
  explanationsUpdated$ = this.explanationsUpdated.asObservable();

  isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$ =
    this.isExplanationTextDisplayedSource.asObservable();

  private isExplanationDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationDisplayed$ = this.isExplanationDisplayedSource.asObservable();

  shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ =
    this.shouldDisplayExplanationSource.asObservable();

  private explanationTrigger = new Subject<void>();
  explanationTrigger$ = this.explanationTrigger.asObservable();

  private resetCompleteSubject = new BehaviorSubject<boolean>(false);
  resetComplete$ = this.resetCompleteSubject.asObservable();

  processedQuestions: Set<string> = new Set<string>();
  currentQuestionExplanation: string | null = null;
  latestExplanation = '';
  explanationsInitialized = false;
  private explanationLocked = false;
  private lockedContext: string | null = null;
  private lastExplanationSignature: string | null = null;
  private lastDisplaySignature: string | null = null;
  private lastDisplayedSignature: string | null = null;
  private readonly defaultContextPrefix = 'question';

  // private readonly _events$ = new Subject<ExplanationEvent>();
  private readonly _currentIndex$ = new BehaviorSubject<number>(0);
  private readonly _gateByIndex = new Map<number, BehaviorSubject<boolean>>();

  private _lastEmittedByIndex = new Map<number, string | null>();
  public _byIndex = new Map<number, BehaviorSubject<string | null>>();
  private _lastByIndex = new Map<number, string | null>();

  private _lastEmitIndex = new BehaviorSubject<number | null>(null);
  public lastEmitIndex$ = this._lastEmitIndex.asObservable();

  public _events$ = new Subject<{ index: number; text: string | null }>();
  public readonly events$ = this._events$.asObservable();
  public _gate = new Map<number, BehaviorSubject<boolean>>();

  private _lastGlobalExplanationIndex: number | null = null;
  public _activeIndex: number | null = null;

  private _explainNow$ = new Subject<{ idx: number; text: string }>();

  private _readyForExplanation = false;
  private _readyForExplanation$ = new BehaviorSubject<boolean>(false);

  public _visibilityLocked = false;

  private _cachedPreArmedExplanation: string | null = null;
  private _cachedPreArmedIndex: number | null = null;

  // Tracks whether the current question text has rendered at least once.
  // Prevents explanation text (FET) from appearing before question paint.
  private _questionRendered = false;
  public questionRendered$ = new BehaviorSubject<boolean>(false);

  // Track which indices currently have open gates (used for cleanup)
  public _gatesByIndex: Map<number, BehaviorSubject<boolean>> = new Map();

  // Remember the last question index whose explanation was locked open
  public _fetLocked: number | null = null;

  public _emittedAtByIndex: Map<number, number> = new Map();  // track when each explanation text was emitted

  // Timestamp of the most recent navigation (from QuizNavigationService).
  public _lastNavTime = 0;

  // Time until which the FET gate is locked (prevents early question re-emission).
  public _fetGateLockUntil = 0;

  private _lastOpenIdx = -1;
  private _lastOpenAt = 0;

  public _hardMuteUntil = 0;

  private _navBarrier = false;

  // Public streams used by CQCC for reactive gating
  public activeIndex$ = new BehaviorSubject<number>(-1);
  public quietZoneUntil$ = new BehaviorSubject<number>(0);

  // Internal guards (already have some of these — keep if they exist)
  public _quietZoneUntil = 0;
  public _hardMuteUntil = 0;
  public _fetGateLockUntil = 0;
  public _activeIndex = -1;

  constructor() {}

  get currentShouldDisplayExplanation(): boolean {
    return this.shouldDisplayExplanationSource.getValue();
  }

  updateExplanationText(question: QuizQuestion): void {
    const expl = question.explanation?.trim() || 'No explanation available';
    this.explanationTextSubject.next(expl);
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  getLatestExplanation(): string {
    return this.latestExplanation;
  }

  prepareExplanationText(question: QuizQuestion): string {
    return question.explanation || 'No explanation available';
  }

  public lockExplanation(context?: string): void {
    this.explanationLocked = true;
    this.lockedContext = this.normalizeContext(context);
  }

  public unlockExplanation(): void {
    this.explanationLocked = false;
    this.lockedContext = null;
  }

  public isExplanationLocked(): boolean {
    return this.explanationLocked;
  }

  public setExplanationText(
    explanation: string | null,
    options: { force?: boolean; context?: string } = {}
  ): void {
    const trimmed = (explanation ?? '').trim();
    const contextKey = this.normalizeContext(options.context);
    const signature = `${contextKey}:::${trimmed}`;
  
    // Visibility lock: prevent overwrites during tab restore
    if ((this as any)._visibilityLocked) {
      console.log('[ETS] ⏸ Ignored setExplanationText while locked');
      return;
    }
  
    if (!options.force && this.explanationLocked) {
      const lockedContext = this.lockedContext ?? this.globalContextKey;
      const contextsMatch =
        lockedContext === this.globalContextKey ||
        contextKey === this.globalContextKey ||
        lockedContext === contextKey;
  
      if (!contextsMatch) {
        console.warn(
          `[🛡️ Blocked explanation update for ${contextKey} while locked to ${lockedContext}]`
        );
        return;
      }
  
      if (trimmed === '') {
        console.warn('[🛡️ Blocked reset: explanation is locked]');
        return;
      }
    }
  
    if (!options.force) {
      const previous = this.explanationByContext.get(contextKey) ?? '';
      if (previous === trimmed && signature === this.lastExplanationSignature) {
        console.log(
          `[🛡️ Prevented duplicate emit${
            contextKey !== this.globalContextKey ? ` for ${contextKey}` : ''
          }]`
        );
        return;
      }
    }
  
    if (trimmed) {
      this.explanationByContext.set(contextKey, trimmed);
    } else {
      this.explanationByContext.delete(contextKey);
    }
  
    this.lastExplanationSignature = signature;
    this.latestExplanation = trimmed;
  
    // Unified emission pipeline
    this.explanationText$.next(trimmed);
    this.formattedExplanationSubject.next(trimmed);
  
    // Ensure direct subject update for visibility-stable downstreams
    try {
      (this as any).explanationTextSubject?.next(trimmed);
    } catch {
      // optional secondary stream
    }
  }

  // Synchronous lookup by question index
  public getFormattedSync(qIdx: number): string | undefined {
    return this.formattedExplanations[qIdx]?.explanation;
  }

  setFormattedExplanationText(explanation: string): void {
    const trimmed = (explanation ?? '').trim();
    this.formattedExplanationSubject.next(trimmed);
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    if (index < 0) {
      console.warn(
        `Invalid index: ${index}, must be greater than or equal to 0`
      );
      return;
    }

    const trimmed = (explanation ?? '').trim();
    const previous = this.explanationTexts[index];

    if (previous !== trimmed) {
      this.explanationTexts[index] = trimmed;
      this.formattedExplanationSubject.next(trimmed);

      this.emitFormatted(index, trimmed || null);
      this.setGate(index, !!trimmed);
    }
  }

  getExplanationTextForQuestionIndex(index: number): Observable<string> {
    const explanationObject = this.formattedExplanations[index];
    if (explanationObject === undefined) {
      console.error(`No explanation found at index ${index}.`);
      return of(`Default explanation for question ${index}`);
    }

    return of(explanationObject.explanation);
  }

  public getFormattedExplanationTextForQuestion(
    questionIndex: number
  ): Observable<string> {
    const FALLBACK = 'No explanation available';

    // Guard invalid index; also clear indexed channel so no stale explanation paints.
    if (typeof questionIndex !== 'number' || isNaN(questionIndex)) {
      console.error(
        `[❌ Invalid questionIndex — must be a number]:`,
        questionIndex
      );

      // Clear per-index stream/gate (coerce to a safe index to avoid NaN keys)
      const idx = Number.isInteger(questionIndex) ? questionIndex : 0;
      try {
        this.emitFormatted(idx, null);
      } catch {}
      try {
        this.setGate(idx, false);
      } catch {}

      // ⬇ DO NOT push fallback text into global/legacy subjects (prevents flashing)
      return of(FALLBACK);
    }

    const entry = this.formattedExplanations[questionIndex];

    if (!entry) {
      console.error(
        `[❌ Q${questionIndex} not found in formattedExplanations`,
        entry
      );
      console.log('🧾 All formattedExplanations:', this.formattedExplanations);

      // Clear per-index stream/gate
      try {
        this.emitFormatted(questionIndex, null);
      } catch {}
      try {
        this.setGate(questionIndex, false);
      } catch {}

      return of(null);
    }

    const explanation = (entry.explanation ?? '').trim();

    if (!explanation) {
      console.warn(`[⚠️ No valid explanation for Q${questionIndex}]`);

      // Clear per-index stream/gate, no global string emits
      try {
        this.emitFormatted(questionIndex, null);
      } catch {}
      try {
        this.setGate(questionIndex, false);
      } catch {}

      return of(FALLBACK);
    }

    // Drive only the index-scoped channel (no global .next here)
    try {
      this.emitFormatted(questionIndex, explanation);
    } catch {}
    try {
      this.setGate(questionIndex, true);
    } catch {}

    return of(explanation);
  }

  getFormattedExplanationByQuestion(
    question: QuizQuestion | null | undefined,
    fallbackIndex?: number
  ): string | null {
    if (!question) {
      if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
        return this.formattedExplanations[fallbackIndex]?.explanation ?? null;
      }
      return null;
    }

    const indexedKey = this.buildQuestionKey(
      question.questionText,
      fallbackIndex
    );
    if (indexedKey) {
      const indexedMatch =
        this.formattedExplanationByQuestionText.get(indexedKey);
      if (indexedMatch) return indexedMatch;
    }

    const plainKey = this.buildQuestionKey(question.questionText);
    if (plainKey) {
      const plainMatch = this.formattedExplanationByQuestionText.get(plainKey);
      if (plainMatch) return plainMatch;
    }

    if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
      return this.formattedExplanations[fallbackIndex]?.explanation ?? null;
    }

    return null;
  }

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = {};
    this.formattedExplanationByQuestionText.clear();

    for (const [index, explanation] of explanations.entries()) {
      this.explanationTexts[index] = explanation;
    }
  }

  initializeFormattedExplanations(
    explanations: { questionIndex: number; explanation: string }[]
  ): void {
    this.formattedExplanations = {}; // clear existing data
    this.formattedExplanationByQuestionText.clear();

    if (!Array.isArray(explanations) || explanations.length === 0) {
      console.warn('No explanations provided for initialization.');
      return;
    }

    for (const { questionIndex, explanation } of explanations) {
      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        console.warn(
          `Invalid questionIndex: ${questionIndex}. It should be a non-negative number.`
        );
        continue;
      }

      if (typeof explanation !== 'string' || !explanation.trim()) {
        console.warn(
          `Invalid or empty explanation for questionIndex ${questionIndex}:`,
          explanation
        );
        this.formattedExplanations[questionIndex] = {
          questionIndex,
          explanation: 'No explanation available',
        };
      } else {
        this.formattedExplanations[questionIndex] = {
          questionIndex,
          explanation: explanation.trim(),
        };
      }
    }

    // Notify subscribers about the updated explanations
    this.explanationsUpdated.next(this.formattedExplanations);
  }

  formatExplanationText(
    question: QuizQuestion,
    questionIndex: number
  ): Observable<{ questionIndex: number; explanation: string }> {
    // Early exit for invalid or stale questions
    if (!this.isQuestionValid(question)) {
      console.warn(
        `[⏩ Skipping invalid or stale question at index ${questionIndex}]`
      );
      return of({ questionIndex, explanation: '' });
    }

    // Explanation fallback if missing or blank
    const rawExplanation =
      question?.explanation?.trim() || 'Explanation not provided';

    // Idempotency detector (same as in formatExplanation)
    const alreadyFormattedRe =
      /^(?:option|options)\s+\d+(?:\s*,\s*\d+)*(?:\s+and\s+\d+)?\s+(?:is|are)\s+correct\s+because\s+/i;

    // Format explanation (only if not already formatted)
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = alreadyFormattedRe.test(rawExplanation)
      ? rawExplanation
      : this.formatExplanation(question, correctOptionIndices, rawExplanation);

    // Store and sync (but coalesce to avoid redundant emits)
    const prev =
      this.formattedExplanations[questionIndex]?.explanation?.trim() || '';
    if (prev !== formattedExplanation) {
      this.storeFormattedExplanation(
        questionIndex,
        formattedExplanation,
        question
      );
      this.syncFormattedExplanationState(questionIndex, formattedExplanation);
      this.updateFormattedExplanation(formattedExplanation);
    }

    // Prevent duplicate processing
    const questionKey =
      question?.questionText ?? JSON.stringify({ i: questionIndex });
    this.processedQuestions.add(questionKey);

    return of({
      questionIndex,
      explanation: formattedExplanation,
    });
  }

  updateFormattedExplanation(explanation: string): void {
    const trimmed = explanation?.trim();
    if (!trimmed) return;

    this.formattedExplanationSubject.next(trimmed);
  }

  storeFormattedExplanation(
    index: number,
    explanation: string,
    question: QuizQuestion
  ): void {
    if (index < 0) {
      console.error(
        `Invalid index: ${index}, must be greater than or equal to 0`
      );
      return;
    }

    if (!explanation || explanation.trim() === '') {
      console.error(`Invalid explanation: "${explanation}"`);
      return;
    }

    const sanitizedExplanation = explanation.trim();
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(
      question,
      correctOptionIndices,
      sanitizedExplanation
    );

    this.formattedExplanations[index] = {
      questionIndex: index,
      explanation: formattedExplanation,
    };

    this.storeFormattedExplanationForQuestion(
      question,
      index,
      formattedExplanation
    );

    this.explanationsUpdated.next(this.formattedExplanations);
  }

  private storeFormattedExplanationForQuestion(
    question: QuizQuestion,
    index: number,
    explanation: string
  ): void {
    if (!question) {
      return;
    }

    const keyWithoutIndex = this.buildQuestionKey(question?.questionText);
    const keyWithIndex = this.buildQuestionKey(question?.questionText, index);

    if (keyWithoutIndex) {
      this.formattedExplanationByQuestionText.set(keyWithoutIndex, explanation);
    }

    if (keyWithIndex) {
      this.formattedExplanationByQuestionText.set(keyWithIndex, explanation);
    }
  }

  /* getCorrectOptionIndices(question: QuizQuestion): number[] {
    if (!question || !Array.isArray(question.options)) {
      console.error("Invalid question or options:", question);
      return [];
    }

    return question.options
      .map((option, index) => {
        if (!option?.correct) {
          return null;
        }

        const displayIndex = typeof option.displayOrder === 'number'
          ? option.displayOrder
          : index;

        return displayIndex + 1;
      })
      .filter((index): index is number => index !== null);
  } */
  getCorrectOptionIndices(question: QuizQuestion): number[] {
    if (!question || !Array.isArray(question.options)) {
      console.error('Invalid question or options:', question);
      return [];
    }

    // Normalize each option to a display position:
    // - use displayOrder when it’s a finite, non-negative number
    // - else fall back to its natural index
    // Then convert to 1-based for human-facing text,
    // dedupe, and sort for stable multi-answer phrasing.
    const indices = question.options
      .map((option, idx) => {
        if (!option?.correct) return null;

        const hasValidDisplayOrder =
          typeof option.displayOrder === 'number' &&
          Number.isFinite(option.displayOrder) &&
          option.displayOrder >= 0;

        const zeroBasedPos = hasValidDisplayOrder ? option.displayOrder : idx;
        return zeroBasedPos + 1; // 1-based for "Option N"
      })
      .filter((n): n is number => n !== null);

    // Dedupe + sort for a stable, readable "Options 1 and 2" string
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  }

  formatExplanation(
    question: QuizQuestion,
    correctOptionIndices: number[] | null | undefined,
    explanation: string
  ): string {
    // Idempotency: if already in "Option(s) ... correct because ..." form, return as-is.
    const alreadyFormattedRe =
      /^(?:option|options)\s+\d+(?:\s*,\s*\d+)*(?:\s+and\s+\d+)?\s+(?:is|are)\s+correct\s+because\s+/i;

    const e = (explanation ?? '').trim();
    if (!e) return '';

    if (alreadyFormattedRe.test(e)) {
      // Already formatted elsewhere; do not re-wrap (prevents "Option 1 is correct because Option 1 is correct because...")
      return e;
    }

    // Normalize incoming indices (may be null/undefined/empty on timeout)
    let indices: number[] = Array.isArray(correctOptionIndices)
      ? correctOptionIndices.slice()
      : [];

    // Fallback: derive from the question’s own option flags (use 1-based for display to match typical copy)
    if (indices.length === 0 && Array.isArray(question?.options)) {
      indices = question.options
        .map((opt, i) => {
          if (!opt?.correct) {
            return -1;
          }
          const hasValidDisplayOrder =
            typeof opt.displayOrder === 'number' &&
            Number.isFinite(opt.displayOrder) &&
            opt.displayOrder >= 0;

          const displayIndex = hasValidDisplayOrder ? opt.displayOrder : i;
          return displayIndex + 1; // +1 so text says “Option 2” etc.
        })
        .filter((n) => n > 0);
    }

    // ✅ Stabilize: dedupe + sort so multi-answer phrasing is consistent
    indices = Array.from(new Set(indices)).sort((a, b) => a - b);

    // Multi-answer
    if (indices.length > 1) {
      question.type = QuestionType.MultipleAnswer;

      const optionsText =
        indices.length > 2
          ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
          : indices.join(' and ');

      return `Options ${optionsText} are correct because ${e}`;
    }

    // Single-answer
    if (indices.length === 1) {
      question.type = QuestionType.SingleAnswer;
      return `Option ${indices[0]} is correct because ${e}`;
    }

    // Zero derived indices → just return the explanation (no scolding)
    return e;
  }

  private syncFormattedExplanationState(
    questionIndex: number,
    formattedExplanation: string
  ): void {
    if (!this.formattedExplanations$[questionIndex]) {
      // Initialize the BehaviorSubject if it doesn't exist at the specified index
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<
        string | null
      >(null);
    }

    // Access the BehaviorSubject at the specified questionIndex
    const subjectAtIndex = this.formattedExplanations$[questionIndex];

    if (subjectAtIndex) {
      subjectAtIndex.next(formattedExplanation);

      // Update the formattedExplanations array
      const formattedExplanationObj: FormattedExplanation = {
        questionIndex,
        explanation: formattedExplanation,
      };
      this.formattedExplanations[questionIndex] = formattedExplanationObj;
    } else {
      console.error(
        `No element at index ${questionIndex} in formattedExplanations$`
      );
    }
  }

  getFormattedExplanation(questionIndex: number): Observable<string> {
    if (!this.explanationsInitialized) {
      return of('No explanation available');
    }

    return this.getFormattedExplanationTextForQuestion(questionIndex).pipe(
      map(
        (explanationText: string) =>
          explanationText?.trim() || 'No explanation available'
      )
    );
  }

  getFormattedExplanations(): Observable<FormattedExplanation[]> {
    const explanations = Object.values(this.formattedExplanations);
    return of(explanations);
  }

  // Emits a formatted explanation for a given question index
  public emitExplanationIfNeeded({
    explanationText,
    questionIndex,
    // Optional strict check
    questionText,
    expectedQuestionText,
    // Optional: pass the full question if you want storeFormattedExplanation() to reformat
    question,
  }: {
    explanationText: string | null | undefined;
    questionIndex: number;
    questionText?: string; // actual current question text
    expectedQuestionText?: string; // expected text from caller; if provided, must match
    question?: QuizQuestion; // optional; used by storeFormattedExplanation()
  }): void {
    const trimmed = (explanationText ?? '').trim();

    // Skip empty/defaults
    if (!trimmed || trimmed.toLowerCase() === 'no explanation available') {
      console.warn(
        `[⏭️ Skipping empty/default explanation for Q${questionIndex}]`
      );
      return;
    }

    // Strict mode (only when expectedQuestionText is provided)
    if (typeof expectedQuestionText === 'string') {
      if ((questionText ?? '') !== expectedQuestionText) {
        console.warn(
          `[❌ Skipping explanation emit for Q${questionIndex}] Mismatched text.`
        );
        console.warn(`Expected: "${expectedQuestionText}"`);
        console.warn(`Received: "${questionText ?? ''}"`);
        return;
      }
    }

    // Coalesce duplicates against last emitted raw explanation per index
    const latestRaw = this.explanationTexts[questionIndex];
    const isSame = latestRaw === trimmed;
    if (isSame) {
      console.log(`[🛑 Skipping redundant emit for Q${questionIndex}]`);
      return;
    }

    // --- CRITICAL: update per-index cache FIRST so the UI's "safe global" filter accepts it ---
    // If you want to preserve your reformatting logic, prefer storeFormattedExplanation;
    // otherwise set the bare cache directly.
    try {
      if (question) {
        // Will call your formatExplanation(...) internally and keep maps in sync
        this.storeFormattedExplanation(questionIndex, trimmed, question);
      } else {
        // Minimal cache write when no QuizQuestion is available
        this.formattedExplanations[questionIndex] = {
          questionIndex,
          explanation: trimmed,
        };
        this.explanationsUpdated.next(this.formattedExplanations);
      }
    } catch (e) {
      console.warn(
        `[⚠️ storeFormattedExplanation failed for Q${questionIndex}]`,
        e
      );
      // Fallback to direct cache
      this.formattedExplanations[questionIndex] = {
        questionIndex,
        explanation: trimmed,
      };
      this.explanationsUpdated.next(this.formattedExplanations);
    }

    // Keep your legacy per-index raw cache
    this.explanationTexts[questionIndex] = trimmed;

    // Update the per-index live channel so index-scoped subscribers get it immediately
    // (these are the methods you added earlier)
    this.emitFormatted?.(questionIndex, trimmed);
    this.setGate?.(questionIndex, true);

    // --- Now emit to the global streams (UI filter will now accept this for current index) ---
    const contextKey = this.buildQuestionContextKey(questionIndex);
    this.formattedExplanationSubject.next(trimmed);
    this.setExplanationText(trimmed, { context: contextKey }); // do not force unless you must
    const displayOptions = { context: contextKey, force: true } as const;
    this.setShouldDisplayExplanation(true, displayOptions);
    this.setIsExplanationTextDisplayed?.(true, displayOptions);

    // Optional: lock to avoid concurrent stomps
    this.lockExplanation();
    this.latestExplanation = trimmed;
  }

  public setIsExplanationTextDisplayed(
    isDisplayed: boolean,
    options: { force?: boolean; context?: string } = {}
  ): void {
    // Visibility lock: prevent overwrites during visibility restore
    if ((this as any)._visibilityLocked) {
      console.log('[ETS] ⏸ Ignored setIsExplanationTextDisplayed while locked');
      return;
    }
  
    const contextKey = this.normalizeContext(options.context);
    const signature = `${options.context ?? 'global'}:::${isDisplayed}`;
  
    if (!options.force) {
      const previous = this.displayedByContext.get(contextKey);
      if (
        previous === isDisplayed &&
        signature === this.lastDisplayedSignature
      ) {
        return;
      }
    }
  
    if (isDisplayed) {
      this.displayedByContext.set(contextKey, true);
    } else if (contextKey === this.globalContextKey) {
      this.displayedByContext.clear();
    } else {
      this.displayedByContext.delete(contextKey);
    }
  
    this.lastDisplayedSignature = signature;
    const aggregated = this.computeContextualFlag(this.displayedByContext);
  
    if (
      !options.force &&
      aggregated === this.isExplanationTextDisplayedSource.getValue()
    ) {
      return;
    }
  
    // Update the canonical BehaviorSubject
    this.isExplanationTextDisplayedSource.next(aggregated);
  
    // Also update a secondary Subject for legacy or parallel subscribers
    try {
      (this as any).isExplanationTextDisplayedSubject?.next(aggregated);
    } catch {
      // optional secondary push; ignore if missing
    }
  }

  public setShouldDisplayExplanation(
    shouldDisplay: boolean,
    options: { force?: boolean; context?: string } = {}
  ): void {
    // Visibility lock: prevent any reactive writes while restoring visibility
    if ((this as any)._visibilityLocked) {
      console.log('[ETS] ⏸ Ignored setShouldDisplayExplanation while locked');
      return;
    }
  
    const contextKey = this.normalizeContext(options.context);
    const signature = `${options.context ?? 'global'}:::${shouldDisplay}`;
  
    if (!options.force) {
      const previous = this.shouldDisplayByContext.get(contextKey);
      if (
        previous === shouldDisplay &&
        signature === this.lastDisplaySignature
      ) {
        return;
      }
    }
  
    if (shouldDisplay) {
      this.shouldDisplayByContext.set(contextKey, true);
    } else if (contextKey === this.globalContextKey) {
      this.shouldDisplayByContext.clear();
    } else {
      this.shouldDisplayByContext.delete(contextKey);
    }
  
    this.lastDisplaySignature = signature;
    const aggregated = this.computeContextualFlag(this.shouldDisplayByContext);
  
    if (
      !options.force &&
      aggregated === this.shouldDisplayExplanationSource.getValue()
    ) {
      return;
    }
  
    // Normal reactive push (this is your main subject)
    this.shouldDisplayExplanationSource.next(aggregated);
  
    // Optional: if you still maintain a convenience mirror Subject, update it too
    try {
      (this as any).shouldDisplayExplanationSubject?.next(aggregated);
    } catch {
      // ignore — optional mirror stream
    }
  }

  public triggerExplanationEvaluation(): void {
    const currentExplanation = this.formattedExplanationSubject.getValue()?.trim();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();

    if (shouldShow && currentExplanation) {
      console.log(`[✅ Explanation Ready to Display]: "${currentExplanation}"`);
      this.explanationTrigger.next();
      this.setExplanationText(currentExplanation, { force: true, context: 'evaluation' });
    } else {
      console.warn('[⏭️ triggerExplanationEvaluation] Skipped — Missing explanation or display flag');
    }

    console.log('[✅ Change Detection Applied after Explanation Evaluation]');
  }

  public async forceShowExplanation(index: number, question?: QuizQuestion): Promise<void> {
    console.log(`[ETS] 🧩 forceShowExplanation CALLED for Q${index + 1}`);
  
    try {
      const q = question;
      if (!q) {
        console.warn(`[ETS] ⚠️ No question found for index ${index}`);
        return;
      }
  
      console.log(`[ETS] ✅ Found question for Q${index + 1}:`, {
        text: q.questionText,
        hasExplanation: !!q.explanation,
        explanation: q.explanation?.slice(0, 60),
        optionsCount: q.options?.length,
      });
  
      const raw = (q.explanation ?? '').trim();
      const correctIdxs = this.getCorrectOptionIndices(q) ?? [];
      const formatted = this.formatExplanation(q, correctIdxs, raw)?.trim?.() ?? raw;
  
      console.log(`[ETS] 🧠 Computed formatted explanation for Q${index + 1}:`, formatted?.slice(0, 80));
  
      this._activeIndex = index;
      this._visibilityLocked = false;
  
      if (!formatted) {
        console.warn(`[ETS] ⚠️ No formatted explanation available for Q${index + 1}`);
      }
  
      this.setExplanationText(formatted, { force: true });
      this.setShouldDisplayExplanation(true, { force: true });
      this.setIsExplanationTextDisplayed(true, { force: true });
  
      console.log(`[ETS ✅] FET successfully displayed for Q${index + 1}`);
    } catch (err) {
      console.error('[ETS ❌] forceShowExplanation failed:', err);
    }
  }
  

  private buildQuestionKey(
    questionText: string | null | undefined,
    index?: number
  ): string | null {
    const normalizedText = (questionText ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (!normalizedText && (index === undefined || index < 0)) {
      return null;
    }

    const indexPart =
      typeof index === 'number' && index >= 0 ? `|${index}` : '';
    return `${normalizedText}${indexPart}`;
  }

  private isQuestionValid(question: QuizQuestion): boolean {
    return (
      question &&
      question.questionText &&
      !this.processedQuestions.has(question.questionText)
    );
  }

  setCurrentQuestionExplanation(explanation: string): void {
    this.currentQuestionExplanation = explanation;
  }

  resetExplanationText(): void {
    // Clear the latest cached explanation details so a fresh explanation can
    // be emitted for the next question interaction.
    this.latestExplanation = '';
    this.currentQuestionExplanation = null;
    this.lastExplanationSignature = null;
    this.lastDisplaySignature = null;
    this.lastDisplayedSignature = null;

    // Ensure all contextual caches are cleared so no stale explanation text
    // is considered “active” for a new question.
    this.explanationByContext.clear();
    this.shouldDisplayByContext.clear();
    this.displayedByContext.clear();

    // Force reset the shared explanation streams so downstream subscribers do
    // not momentarily render the previous question’s explanation.
    this.setExplanationText('', { force: true });
    this.explanationTextSubject.next('');
    this.setShouldDisplayExplanation(false, { force: true });
    this.setIsExplanationTextDisplayed(false, { force: true });

    // Mark the explanation as hidden for the current cycle.
    this.isExplanationDisplayedSource.next(false);
  }

  resetStateBetweenQuestions(): void {
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }

  resetExplanationState(): void {
    this.unlockExplanation();

    this.latestExplanation = '';
    this.currentQuestionExplanation = null;
    this.lastExplanationSignature = null;
    this.lastDisplaySignature = null;
    this.lastDisplayedSignature = null;

    this.explanationByContext.clear();
    this.shouldDisplayByContext.clear();
    this.displayedByContext.clear();

    this.explanationTextSubject.next('');
    this.explanationText$.next('');
    this.formattedExplanationSubject.next('');

    this.explanationTexts = {};

    this.shouldDisplayExplanationSource.next(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.resetCompleteSubject.next(false);
  }

  resetProcessedQuestionsState(): void {
    this.processedQuestions = new Set<string>();
  }

  setResetComplete(value: boolean): void {
    this.resetCompleteSubject.next(value);
  }

  public forceResetBetweenQuestions(): void {
    this.unlockExplanation();

    this.latestExplanation = '';
    this.currentQuestionExplanation = null;
    this.lastExplanationSignature = null;
    this.lastDisplaySignature = null;
    this.lastDisplayedSignature = null;
    this.explanationTexts = {};

    this.explanationByContext.clear();
    this.shouldDisplayByContext.clear();
    this.displayedByContext.clear();

    this.explanationTextSubject.next('');
    this.explanationText$.next('');
    this.formattedExplanationSubject.next('');

    this.shouldDisplayExplanationSource.next(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.resetCompleteSubject.next(false);
  }

  private buildQuestionContextKey(questionIndex: number): string {
    return `${this.defaultContextPrefix}:${Math.max(
      0,
      Number(questionIndex) || 0
    )}`;
  }

  private normalizeContext(context?: string | null): string {
    const normalized = (context ?? '').toString().trim();
    return normalized || this.globalContextKey;
  }

  private computeContextualFlag(map: Map<string, boolean>): boolean {
    for (const value of map.values()) {
      if (value) {
        return true;
      }
    }

    return false;
  }

  // Canonical per-index observable (null when nothing valid yet)
  public byIndex$(index: number): Observable<string | null> {
    return this.getOrCreate(index).text$.asObservable();
  }

  // Back-compat aliases (optional): keep calls working but funnel to byIndex$
  public getFormattedStreamFor(index: number): Observable<string | null> {
    return this.byIndex$(index);
  }
  
  public formattedFor$(index: number): Observable<string | null> {
    return this.byIndex$(index);
  }

  // ---- Emit per-index formatted text; coalesces duplicates and broadcasts event
  public emitFormatted(index: number, value: string | null): void {
    const { text$ } = this.getOrCreate(index);
    const trimmed = (value ?? '').trim() || null;
    text$.next(trimmed);
    console.log(`[ETS] emitFormatted(${index}) →`, trimmed?.slice(0,60) ?? 'null');
  }

  // ---- Per-index gate
  public gate$(index: number): Observable<boolean> {
    return this.getOrCreate(index).gate$.asObservable();
  }

  public setGate(index: number, show: boolean): void {
    const idx = Math.max(0, Number(index) || 0);
    if (!this._gate.has(idx)) {
      this._gate.set(idx, new BehaviorSubject<boolean>(false));
    }
    const bs = this._gate.get(idx)!;
    const next = !!show;
    if (bs.getValue() !== next) bs.next(next);  // coalesce
  }

  // ---- Hard reset one index (use when leaving an index)
  public clearIndex(index: number): void {
    const idx = Math.max(0, Number(index) || 0);

    this._lastByIndex.set(idx, null);

    if (!this._byIndex.has(idx)) {
      this._byIndex.set(idx, new BehaviorSubject<string | null>(null));
    }
    this._byIndex.get(idx)!.next(null);

    if (!this._gate.has(idx)) {
      this._gate.set(idx, new BehaviorSubject<boolean>(false));
    }
    this._gate.get(idx)!.next(false);
  }

  // Call to open a gate for an index
  public openExclusive(index: number, formatted: string | null): void {
    const { text$, gate$ } = this.getOrCreate(index);
    const trimmed = (formatted ?? '').trim() || null;
  
    const now = performance.now();
    const lastNav = this._lastNavTime ?? 0;
    const sinceNav = now - lastNav;
    const quietUntil = this._quietZoneUntil ?? 0;
  
    // HARD FIREWALL: Block any FET open during quiet zone or hard mute
    if (now < quietUntil || now < (this._hardMuteUntil ?? 0)) {
      const wait = Math.max(quietUntil, this._hardMuteUntil ?? 0) - now;
      console.log(
        `[ETS] 🔇 Suppressing FET open (${wait.toFixed(1)}ms left in quiet/mute zone, idx=${index})`
      );
      return;
    }
  
    // 1. Double-gate: prevent reopen within ~2 frames of previous open
    const sinceLastOpen = now - this._lastOpenAt;
    if (index === this._lastOpenIdx && sinceLastOpen < 34) {
      console.log(`[ETS] ⏸ Skipped redundant FET open (${sinceLastOpen.toFixed(1)}ms)`);
      return;
    }
    this._lastOpenIdx = index;
    this._lastOpenAt = now;
  
    // 2. Delay gate activation if too soon after navigation
    const delay = sinceNav < 72 ? 72 - sinceNav : 0;
  
    const activate = () => {
      this._activeIndex = index;
      text$.next(trimmed);
      gate$.next(!!trimmed);
      console.log(
        `[ETS] openExclusive(${index}) → gate=${!!trimmed}, len=${trimmed?.length ?? 0}, delayed=${delay.toFixed(1)}ms`
      );
    };
  
    if (delay > 0) {
      setTimeout(() => requestAnimationFrame(activate), delay);
    } else {
      activate();
    }
  
    // Record diagnostics
    this._emittedAtByIndex ??= new Map<number, number>();
    this._emittedAtByIndex.set(index, now);
  
    // 3. Micro gate-lock window: block any new FET for ~3 frames after this one
    this._fetGateLockUntil = now + 48;
  }

  // Helper to fetch timestamp safely elsewhere
  public getLastEmitTime(index: number): number {
    return this._emittedAtByIndex.get(index) ?? 0;
  }

  public closeOthersExcept(index: number): void {
    const idx = Math.max(0, Number(index) || 0);
  
    for (const [k, gate$] of this._gate.entries()) {
      if (k !== idx) {
        try { gate$.next(false); } catch {}
        try { this._byIndex.get(k)?.next(null); } catch {}
      }
    }
  
    // Reset activeIndex if it’s no longer valid
    if (this._activeIndex !== idx) {
      this._activeIndex = idx;
    }
  
    console.log(`[ETS] 🔒 closeOthersExcept → kept=${idx}`);
  }

  public closeAll(): void {
    try {
      // Close all gates
      for (const [idx, gate$] of this._gate.entries()) {
        try { gate$.next(false); } catch {}
      }
  
      // Clear formatted explanation streams
      for (const [idx, subj] of this._byIndex.entries()) {
        try { subj.next(null); } catch {}
      }
  
      // Reset internal trackers
      this._activeIndex = null;
      this._lastByIndex.clear();
  
      console.log('[ExplanationTextService] 🔒 All gates closed & formatted text cleared');
    } catch (err) {
      console.warn('[ExplanationTextService] ⚠️ closeAll failed:', err);
    }
  }

  private getOrCreate(index: number) {
    if (!this._byIndex.has(index)) this._byIndex.set(index, new BehaviorSubject<string | null>(null));
    if (!this._gate.has(index))   this._gate.set(index,   new BehaviorSubject<boolean>(false));
    return { text$: this._byIndex.get(index)!, gate$: this._gate.get(index)! };
  }

  // Reset explanation state cleanly for a new index
  public resetForIndex(index: number): void {
    // close previous
    if (this._activeIndex !== -1 && this._activeIndex !== index) {
      try { this._byIndex.get(this._activeIndex)?.next(null); } catch {}
      try { this._gate.get(this._activeIndex)?.next(false); } catch {}
      delete this.formattedExplanations?.[this._activeIndex];
    }
  
    // ensure and hard-emit null/false for new index
    const { text$, gate$ } = this.getOrCreate(index);
    try { text$.next(null); } catch {}
    try { gate$.next(false); } catch {}
  
    this._activeIndex = index;
    this.formattedExplanations[index] = { questionIndex: index, explanation: null };
    console.log(`[ETS] resetForIndex(${index}) -> null/false`);
  }

  // Observable for a specific index (UI will subscribe per index)
  public explainNowFor(idx: number): Observable<string | null> {
    return this._explainNow$.pipe(
      filter(e => e.idx === idx),
      map(e => (e.text ?? '').trim() || null)
    );
  }

  // Single entry point to open explanation atomically (no flicker)
  public triggerExplainNow(index: number, formatted: string): void {
    const idx = Math.max(0, Number(index) || 0);
    const trimmed = (formatted ?? '').trim();

    // Close others
    for (const [k, subj] of this._byIndex.entries()) {
      if (k !== idx) try { subj.next(null); } catch {}
    }
    for (const [k, gate] of this._gate.entries()) {
      if (k !== idx) try { gate.next(false); } catch {}
    }

    // Ensure subjects
    if (!this._byIndex.has(idx)) this._byIndex.set(idx, new BehaviorSubject<string | null>(null));
    if (!this._gate.has(idx)) this._gate.set(idx, new BehaviorSubject<boolean>(false));

    // Commit state in one frame
    this._activeIndex = idx;
    this._byIndex.get(idx)!.next(trimmed || null);
    this._gate.get(idx)!.next(!!trimmed);
    this.setShouldDisplayExplanation(true, { force: true });

    // Fire atomic event last (UI “fast path”)
    this._explainNow$.next({ idx, text: trimmed });

    // Optional cache
    this.formattedExplanations[idx] = { questionIndex: idx, explanation: trimmed || null };
  }

  public hardSwitchToIndex(index: number): void {
    // Step 1: nuke every existing subject immediately
    for (const subj of this._byIndex.values()) { try { subj.next(null); } catch {} }
    for (const gate of this._gate.values()) { try { gate.next(false); } catch {} }
  
    // Step 2: clear the formatted cache
    this.formattedExplanations = {};
  
    // Step 3: create brand-new subjects for this index
    this._byIndex.set(index, new BehaviorSubject<string | null>(null));
    this._gate.set(index, new BehaviorSubject<boolean>(false));
  
    // Step 4: mark active index and reset display flag
    this._activeIndex = index;
    this.setShouldDisplayExplanation(false, { force: true });
  
    queueMicrotask(() => console.log(`[ETS] ⚙️ hardSwitchToIndex(${index}) done`));
  }

  // Observable for other components to listen for readiness changes
  public get readyForExplanation$(): Observable<boolean> {
    return this._readyForExplanation$.asObservable();
  }

  // Get the current readiness flag
  public getReadyForExplanation(): boolean {
    return this._readyForExplanation;
  }

  // Set readiness flag — true when navigation finishes and FET is cached
  public setReadyForExplanation(ready: boolean): void {
    this._readyForExplanation = ready;
    this._readyForExplanation$.next(ready);
    console.log(`[ETS] ⚙️ setReadyForExplanation = ${ready}`);
  }

  // Silently pre-caches an explanation for later use without triggering UI updates. This should never emit or toggle display flags.
  public silentlyPrecacheExplanation(index: number, formatted: string): void {
    try {
      this._cachedPreArmedExplanation = formatted;
      this._cachedPreArmedIndex = index;
      console.log(`[ETS] 💾 Silently cached FET for Q${index + 1}`);
    } catch (err) {
      console.warn('[ETS] ⚠️ Failed to precache explanation', err);
    }
  }
  
  public lockVisibilityRestore(): void {
    this._visibilityLocked = true;
    console.log('[ETS] 🔒 Explanation pipeline locked');
  }

  public unlockVisibilityRestore(): void {
    this._visibilityLocked = false;
    console.log('[ETS] 🔓 Explanation pipeline unlocked');
  }

  public markQuestionRendered(rendered = true): void {
    this._questionRendered = rendered;
    this.questionRendered$.next(rendered);
  }

  // Check if the current question has been rendered at least once.
  public get hasRenderedQuestion(): boolean {
    return this._questionRendered === true;
  }

  // Reset render tracking before a new question loads.
  public resetQuestionRenderFlag(): void {
    this._questionRendered = false;
    this.questionRendered$.next(false);
  }
  
  public async waitUntilQuestionRendered(timeoutMs = 500): Promise<void> {
    try {
      await firstValueFrom(
        this.questionRendered$.pipe(
          filter((v) => v === true),
          take(1),
          timeout(timeoutMs)
        )
      );
    } catch {
      // swallow timeouts or interruptions silently
    }
  }

  public closeGateForIndex(index: number): void {
    const gate = this._gatesByIndex?.get(index);
    if (gate) {
      gate.next(false);
      console.log(`[ETS] Closed gate for Q${index + 1}`);
    }
  }

  public closeAllGates(): void {
    this._gatesByIndex.clear();
    this._fetLocked = null;
  
    try {
      this.setShouldDisplayExplanation(false, { force: true });
      this.setIsExplanationTextDisplayed(false);
    } catch (err) {
      console.warn('[ETS] Failed to close gates cleanly', err);
    }
  
    console.log('[ETS] All explanation gates closed');
  }

  public isGateOpen(index: number): boolean {
    const gate = this._gate?.get(index);
    return !!gate && gate.getValue?.() === true;
  }

  public isFetGateLocked(): boolean {
    return performance.now() < (this._fetGateLockUntil ?? 0);
  }

  public markLastNavTime(time: number): void {
    this._lastNavTime = time;
  }

  public enableNavBarrier(): void {
    this._navBarrier = true;
    console.log('[ETS] 🧱 Navigation barrier ENABLED');
  }
  
  public disableNavBarrier(): void {
    this._navBarrier = false;
    console.log('[ETS] 🟢 Navigation barrier DISABLED');
  }
  
  public isNavBarrierActive(): boolean {
    return this._navBarrier;
  }

  public setQuietZone(durationMs: number): void {
    const until = performance.now() + durationMs;
    this._quietZoneUntil = until;
    this.quietZoneUntil$.next(until);
    console.log(`[ETS] 💤 Quiet zone activated for ${durationMs}ms`);
  }
}