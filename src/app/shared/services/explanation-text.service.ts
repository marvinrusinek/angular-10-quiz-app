import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
} from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

export interface ExplanationEvent {
  index: number;
  text: string | null;
}

@Injectable({ providedIn: 'root' })
export class ExplanationTextService {
  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanation$ = this.explanationTextSubject.asObservable();

  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
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
  private _byIndex = new Map<number, BehaviorSubject<string | null>>();
  private _lastByIndex = new Map<number, string | null>();

  private _lastEmitIndex = new BehaviorSubject<number | null>(null);
  public lastEmitIndex$ = this._lastEmitIndex.asObservable();

  public _events$ = new Subject<{ index: number; text: string | null }>();
  public readonly events$ = this._events$.asObservable();
  private _gate = new Map<number, BehaviorSubject<boolean>>();

  private _lastGlobalExplanationIndex: number | null = null;
  public _activeIndex: number | null = null;

  constructor() {}

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
    this.explanationText$.next(trimmed);
    this.formattedExplanationSubject.next(trimmed);
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

      // No side-effects into global subject here; return fallback to caller only.
      return of(FALLBACK);
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
      if (indexedMatch) {
        return indexedMatch;
      }
    }

    const plainKey = this.buildQuestionKey(question.questionText);
    if (plainKey) {
      const plainMatch = this.formattedExplanationByQuestionText.get(plainKey);
      if (plainMatch) {
        return plainMatch;
      }
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

    this.isExplanationTextDisplayedSource.next(aggregated);
  }

  public setShouldDisplayExplanation(
    shouldDisplay: boolean,
    options: { force?: boolean; context?: string } = {}
  ): void {
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

    this.shouldDisplayExplanationSource.next(aggregated);
  }

  public triggerExplanationEvaluation(): void {
    const currentExplanation = this.formattedExplanationSubject
      .getValue()
      ?.trim();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();

    if (shouldShow && currentExplanation) {
      console.log(`[✅ Explanation Ready to Display]: "${currentExplanation}"`);
      this.explanationTrigger.next();
      this.setExplanationText(currentExplanation, {
        force: true,
        context: 'evaluation',
      });
    } else {
      console.warn(
        '[⏭️ triggerExplanationEvaluation] Skipped — Missing explanation or display flag'
      );
    }

    console.log('[✅ Change Detection Applied after Explanation Evaluation]');
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
    const idx = Math.max(0, Number(index) || 0);
    if (!this._byIndex.has(idx)) {
      this._byIndex.set(idx, new BehaviorSubject<string | null>(null));
    }
  
    return this._byIndex.get(idx)!.pipe(
      // 👇 Hold previous value for its own index; null out others only when a new one opens
      map(text => (this._activeIndex === idx ? text : null)),
      distinctUntilChanged()
    );
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
    const idx = Math.max(0, Number(index) || 0);
    const trimmed = (value ?? '').toString().trim() || null;

    const last = this._lastByIndex.get(idx) ?? null;
    if (last === trimmed) return; // coalesce duplicate emits

    if (!this._byIndex.has(idx)) {
      this._byIndex.set(idx, new BehaviorSubject<string | null>(null));
    }

    this._lastByIndex.set(idx, trimmed);
    this._byIndex.get(idx)!.next(trimmed);

    // Record which index most recently produced a visible explanation
    this._lastGlobalExplanationIndex = trimmed ? idx : this._lastGlobalExplanationIndex;

    // Single, index-scoped event for anyone listening
    this._events$.next({ index: idx, text: trimmed });
  }

  // ---- Per-index gate
  public gate$(index: number): Observable<boolean> {
    const idx = Math.max(0, Number(index) || 0);
    if (!this._gate.has(idx)) {
      this._gate.set(idx, new BehaviorSubject<boolean>(false));
    }
    return this._gate.get(idx)!.asObservable().pipe(distinctUntilChanged());
  }

  public setGate(index: number, show: boolean): void {
    const idx = Math.max(0, Number(index) || 0);
    if (!this._gate.has(idx)) {
      this._gate.set(idx, new BehaviorSubject<boolean>(false));
    }
    const bs = this._gate.get(idx)!;
    const next = !!show;
    if (bs.getValue() !== next) bs.next(next); // coalesce
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

  // (Optional) If you still need this helper, keep it; otherwise remove to reduce surface area
  public getLastGlobalExplanationIndex(): number | null {
    // Prefer the explicit numeric tracker (set by emitFormatted)
    if (this._lastGlobalExplanationIndex !== null) return this._lastGlobalExplanationIndex;

    const sig = this.lastExplanationSignature ?? '';
    const i = sig.indexOf('question:');
    if (i === -1) return null;
    const after = sig.slice(i + 'question:'.length);
    const j = after.indexOf(':::');
    const idxStr = (j >= 0 ? after.slice(0, j) : after).trim();
    const idx = Number(idxStr);
    return Number.isInteger(idx) && idx >= 0 ? idx : null;
  }

  // Call to open a gate for an index
  public openExclusive(index: number, formatted: string | null): void {
    const idx = Math.max(0, Number(index) || 0);
  
    // Close all other gates and explanation streams immediately
    for (const [k, gate$] of this._gate.entries()) {
      if (k !== idx) { try { gate$.next(false); } catch {} }
    }
    for (const [k, subj] of this._byIndex.entries()) {
      if (k !== idx) { try { subj.next(null); } catch {} }
    }
  
    // Schedule open on microtask boundary → avoids same-tick “flash”
    queueMicrotask(() => {
      this._activeIndex = idx;
  
      // Cache and emit formatted text for this index
      try { this.storeFormattedExplanation(idx, formatted ?? '', null); } catch {}
      try { this.emitFormatted(idx, formatted); } catch {}
      try { this.setGate(idx, true); } catch {}
  
      console.debug(`[ETS] 🟢 openExclusive(${idx}) → gate open`);
    });
  }  

  public closeOthersExcept(index: number): void {
    const idx = Math.max(0, Number(index) || 0);
    for (const [k, gate$] of this._gate.entries()) {
      if (k !== idx) {
        try { gate$.next(false); } catch {}
      }
    }
    for (const [k, subj] of this._byIndex.entries()) {
      if (k !== idx) {
        try { subj.next(null); } catch {}
      }
    }
    // Keep the active index untouched
    this._activeIndex = idx;
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
}
