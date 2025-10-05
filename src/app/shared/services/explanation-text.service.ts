import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { distinctUntilChanged, filter, map, shareReplay, startWith } from 'rxjs/operators';

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
  formattedExplanation$: Observable<string> = this.formattedExplanationSubject.asObservable();
  private formattedExplanationByQuestionText = new Map<string, string>();

  private readonly globalContextKey = 'global';
  private explanationByContext = new Map<string, string>();
  private shouldDisplayByContext = new Map<string, boolean>();
  private displayedByContext = new Map<string, boolean>();

  private explanationsUpdated = new BehaviorSubject<Record<number, FormattedExplanation>>(this.formattedExplanations);
  explanationsUpdated$ = this.explanationsUpdated.asObservable();

  isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$ = this.isExplanationTextDisplayedSource.asObservable();

  private isExplanationDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationDisplayed$ = this.isExplanationDisplayedSource.asObservable();

  shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSource.asObservable();

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

  private readonly _events$ = new Subject<ExplanationEvent>();
  private readonly _currentIndex$ = new BehaviorSubject<number>(0);
  private readonly _gateByIndex = new Map<number, BehaviorSubject<boolean>>();

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
          `[🛡️ Prevented duplicate emit${contextKey !== this.globalContextKey ? ` for ${contextKey}` : ''}]`
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
      console.warn(`Invalid index: ${index}, must be greater than or equal to 0`);
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
  
  public getFormattedExplanationTextForQuestion(questionIndex: number): Observable<string> {
    if (typeof questionIndex !== 'number' || isNaN(questionIndex)) {
      console.error(`[❌ Invalid questionIndex — must be a number]:`, questionIndex);
      this.formattedExplanationSubject.next('No explanation available');
      return of('No explanation available');
    }
  
    const entry = this.formattedExplanations[questionIndex];
  
    if (!entry) {
      console.error(`[❌ Q${questionIndex} not found in formattedExplanations`, entry);
      console.log('🧾 All formattedExplanations:', this.formattedExplanations);
      this.formattedExplanationSubject.next('No explanation available');
      return of('No explanation available');
    }
  
    const explanation = entry.explanation?.trim();
    if (!explanation) {
      console.warn(`[⚠️ No valid explanation for Q${questionIndex}]`);
      this.formattedExplanationSubject.next('No explanation available');
      return of('No explanation available');
    }
  
    this.formattedExplanationSubject.next(explanation);
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

    const indexedKey = this.buildQuestionKey(question.questionText, fallbackIndex);
    if (indexedKey) {
      const indexedMatch = this.formattedExplanationByQuestionText.get(indexedKey);
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

  initializeFormattedExplanations(explanations: { questionIndex: number; explanation: string }[]): void {
    this.formattedExplanations = {};  // clear existing data
    this.formattedExplanationByQuestionText.clear();

    if (!Array.isArray(explanations) || explanations.length === 0) {
      console.warn('No explanations provided for initialization.');
      return;
    }

    for (const { questionIndex, explanation } of explanations) {
      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        console.warn(`Invalid questionIndex: ${questionIndex}. It should be a non-negative number.`);
        continue;
      }
    
      if (typeof explanation !== 'string' || !explanation.trim()) {
        console.warn(`Invalid or empty explanation for questionIndex ${questionIndex}:`, explanation);
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: 'No explanation available' };
      } else {
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: explanation.trim() };
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
      console.warn(`[⏩ Skipping invalid or stale question at index ${questionIndex}]`);
      return of({ questionIndex, explanation: '' });
    }
  
    // Explanation fallback if missing or blank
    const rawExplanation = question?.explanation?.trim() || 'Explanation not provided';
  
    // Format explanation
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices, rawExplanation);
  
    // Store and sync
    this.storeFormattedExplanation(questionIndex, formattedExplanation, question);
    this.syncFormattedExplanationState(questionIndex, formattedExplanation);
    this.updateFormattedExplanation(formattedExplanation);
  
    // Prevent duplicate processing
    const questionKey = JSON.stringify(question);
    this.processedQuestions.add(questionKey);
  
    return of({
      questionIndex,
      explanation: formattedExplanation
    });
  }

  updateFormattedExplanation(explanation: string): void {
    const trimmed = explanation?.trim();
    if (!trimmed) return;

    this.formattedExplanationSubject.next(trimmed);
  }

  storeFormattedExplanation(index: number, explanation: string, question: QuizQuestion): void {
    if (index < 0) {
      console.error(`Invalid index: ${index}, must be greater than or equal to 0`);
      return;
    }

    if (!explanation || explanation.trim() === "") {
      console.error(`Invalid explanation: "${explanation}"`);
      return;
    }

    const sanitizedExplanation = explanation.trim();
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices, sanitizedExplanation);

    this.formattedExplanations[index] = {
      questionIndex: index,
      explanation: formattedExplanation
    };

    this.storeFormattedExplanationForQuestion(question, index, formattedExplanation);

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

  getCorrectOptionIndices(question: QuizQuestion): number[] {
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
  }

  formatExplanation(
    question: QuizQuestion,
    correctOptionIndices: number[] | null | undefined,
    explanation: string
  ): string {
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

          const displayIndex = typeof opt.displayOrder === 'number'
            ? opt.displayOrder
            : i;

          return displayIndex + 1;
        })  // +1 so text says “Option 2” etc.
        .filter((n) => n > 0);
    }
  
    // Multi-answer
    if (indices.length > 1) {
      question.type = QuestionType.MultipleAnswer;
  
      const optionsText =
        indices.length > 2
          ? `${indices.slice(0, -1).join(', ')} and ${indices.slice(-1)}`
          : indices.join(' and ');
  
      return `Options ${optionsText} are correct because ${explanation}`;
    }
  
    // Single-answer
    if (indices.length === 1) {
      question.type = QuestionType.SingleAnswer;
      return `Option ${indices[0]} is correct because ${explanation}`;
    }
  
    // Zero derived indices → just return the explanation (no scolding)
    return (explanation ?? '').trim();
  }  

  private syncFormattedExplanationState(
    questionIndex: number, formattedExplanation: string): void {
    if (!this.formattedExplanations$[questionIndex]) {
      // Initialize the BehaviorSubject if it doesn't exist at the specified index
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<string | null>(null);
    }
  
    // Access the BehaviorSubject at the specified questionIndex
    const subjectAtIndex = this.formattedExplanations$[questionIndex];
  
    if (subjectAtIndex) {
      subjectAtIndex.next(formattedExplanation);
      
      // Update the formattedExplanations array
      const formattedExplanationObj: FormattedExplanation = 
        { questionIndex, explanation: formattedExplanation };
      this.formattedExplanations[questionIndex] = formattedExplanationObj;
    } else {
      console.error(`No element at index ${questionIndex} in formattedExplanations$`);
    }
  }

  getFormattedExplanation(questionIndex: number): Observable<string> {
    if (!this.explanationsInitialized) {
      return of('No explanation available');
    }
  
    return this.getFormattedExplanationTextForQuestion(questionIndex).pipe(
      map((explanationText: string) =>
        explanationText?.trim() || 'No explanation available'
      )
    );
  }  

  getFormattedExplanations(): Observable<FormattedExplanation[]> {
    const explanations = Object.values(this.formattedExplanations);
    return of(explanations);
  }

  emitExplanationIfNeeded(rawExplanation: string, questionIndex: number): void {
    const trimmed = rawExplanation?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'no explanation available') {
      console.log('[⏭️ Skipping empty or default explanation]');
      return;
    }
  
    const latest = this.explanationTexts[questionIndex];
    const isSame = latest === trimmed;
  
    if (!isSame) {
      console.log(`[📤 Emitting explanation for Q${questionIndex}]:`, trimmed);

      const contextKey = this.buildQuestionContextKey(questionIndex);

      this.explanationTexts[questionIndex] = trimmed;
      this.formattedExplanationSubject.next(trimmed);
      this.setExplanationText(trimmed, {
        context: this.buildQuestionContextKey(questionIndex),
      });
      this.setShouldDisplayExplanation(true, {
        context: this.buildQuestionContextKey(questionIndex),
        force: true
      });
      this.lockExplanation();
      this.latestExplanation = trimmed;
    } else {
      console.log(`[🛑 Skipping redundant emit for Q${questionIndex}]`);
    }
  }  

  public setIsExplanationTextDisplayed(
    isDisplayed: boolean,
    options: { force?: boolean; context?: string } = {}
  ): void {
    const contextKey = this.normalizeContext(options.context);
    const signature = `${options.context ?? 'global'}:::${isDisplayed}`;

    if (!options.force) {
      const previous = this.displayedByContext.get(contextKey);
      if (previous === isDisplayed && signature === this.lastDisplayedSignature) {
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

    if (!options.force && aggregated === this.isExplanationTextDisplayedSource.getValue()) {
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
      if (previous === shouldDisplay && signature === this.lastDisplaySignature) {
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

    if (!options.force && aggregated === this.shouldDisplayExplanationSource.getValue()) {
      return;
    }

    this.shouldDisplayExplanationSource.next(aggregated);
  }
  
  public triggerExplanationEvaluation(): void {
    const currentExplanation = this.formattedExplanationSubject.getValue()?.trim();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();
  
    if (shouldShow && currentExplanation) {
      console.log(`[✅ Explanation Ready to Display]: "${currentExplanation}"`);
      this.explanationTrigger.next();
      this.setExplanationText(currentExplanation, {
        force: true,
        context: 'evaluation'
      });
    } else {
      console.warn('[⏭️ triggerExplanationEvaluation] Skipped — Missing explanation or display flag');
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

    const indexPart = typeof index === 'number' && index >= 0 ? `|${index}` : '';
    return `${normalizedText}${indexPart}`;
  }

  private isQuestionValid(question: QuizQuestion): boolean {
    return question && 
           question.questionText && 
           !this.processedQuestions.has(question.questionText);
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

  emitExplanationIfNeededStrict({
    explanationText,
    questionIndex,
    questionText,
    expectedQuestionText
  }: {
    explanationText: string;
    questionIndex: number;
    questionText: string;              // from the locked current question
    expectedQuestionText: string;      // from the component calling this
  }): void {
    const trimmed = explanationText?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'no explanation available') {
      console.warn(`[⏭️ Skipping empty/default explanation for Q${questionIndex}]`);
      return;
    }
  
    // Compare directly without needing external services
    if (questionText !== expectedQuestionText) {
      console.warn(`[❌ Skipping explanation emit for Q${questionIndex}] Mismatched text.`);
      console.warn(`Expected: "${expectedQuestionText}"`);
      console.warn(`Received: "${questionText}"`);
      return;
    }
  
    const latest = this.explanationTexts[questionIndex];
    const isSame = latest === trimmed;
  
    if (!isSame) {
      this.explanationTexts[questionIndex] = trimmed;
      this.formattedExplanationSubject.next(trimmed);
      const contextKey = this.buildQuestionContextKey(questionIndex);
      this.setExplanationText(trimmed, {
        context: contextKey
      });
      const displayOptions = { context: contextKey, force: true } as const;
      this.setShouldDisplayExplanation(true, displayOptions);
      this.setIsExplanationTextDisplayed(true, displayOptions);
      this.lockExplanation();

      this.latestExplanation = trimmed;
    } else {
      console.log(`[🛑 Skipping redundant emit for Q${questionIndex}]`);
    }
  }

  public shouldEmitExplanation(
    lockedIndex: number,
    lockedText: string,
    currentIndex: number,
    currentText: string,
    lockedTimestamp: number,
    latestTimestamp: number
  ): boolean {
    return (
      lockedIndex === currentIndex &&
      lockedText === currentText &&
      lockedTimestamp === latestTimestamp
    );
  }
  
  public pushFormatted(text: string): void {
    this.formattedExplanationSubject.next((text ?? '').toString().trim());
  }

  private buildQuestionContextKey(questionIndex: number): string {
    return `${this.defaultContextPrefix}:${Math.max(0, Number(questionIndex) || 0)}`;
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

  // Tell service which index is "current" (optional helper for components)
  public setCurrentIndex(i: number): void {
    if (Number.isInteger(i)) this._currentIndex$.next(i);
  }

  // Emit formatted (or clear with null) for a specific index
  public emitFormatted(index: number, text: string | null): void {
    this._events$.next({ index, text });
  }

  // Read explanation bound to a specific index
  public explanationForIndex$(index: number): Observable<string | null> {
    return this._events$.pipe(
      filter(ev => ev.index === index),
      map(ev => ev.text),
      startWith(null),
      distinctUntilChanged((a, b) => (a ?? '').trim() === (b ?? '').trim()),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // Read gate bound to a specific index
  public gateForIndex$(index: number): Observable<boolean> {
    let bs = this._gateByIndex.get(index);
    if (!bs) {
      bs = new BehaviorSubject<boolean>(false);
      this._gateByIndex.set(index, bs);
    }
    return bs.asObservable().pipe(distinctUntilChanged(), shareReplay(1));
  }

  // Set gate for a specific index
  public setGate(index: number, show: boolean): void {
    let bs = this._gateByIndex.get(index);
    if (!bs) {
      bs = new BehaviorSubject<boolean>(false);
      this._gateByIndex.set(index, bs);
    }
    bs.next(!!show);
  }

  // Convenience: compute + emit + open gate for index
  public showForIndex(index: number, question: QuizQuestion | null | undefined): string | null {
    const formatted = this.formatExplanation(question as any, this.getCorrectOptionIndices(question as any), (question as any)?.explanation?.trim() || 'Explanation not provided');
    const trimmed = (formatted ?? '').trim() || null;
    this.emitFormatted(index, trimmed);
    this.setGate(index, !!trimmed);
    return trimmed;
  }

  // Convenience: clear explanation + close gate for index
  public hideForIndex(index: number): void {
    this.emitFormatted(index, null);
    this.setGate(index, false);
  }
}