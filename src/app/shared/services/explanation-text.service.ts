import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class ExplanationTextService {
  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanation$ = this.explanationTextSubject.asObservable();

  explanationText$: BehaviorSubject<string | null> = 
    new BehaviorSubject<string | null>('');
  explanationTexts: Record<number, string> = {};
  
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  formattedExplanationSubject = new BehaviorSubject<string | null>(null);
  formattedExplanation$: Observable<string> = this.formattedExplanationSubject.asObservable();

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

  public lockExplanation(): void {
    this.explanationLocked = true;
  }

  public unlockExplanation(): void {
    this.explanationLocked = false;
  }

  public isExplanationLocked(): boolean {
    return this.explanationLocked;
  }  

  public setExplanationText(explanation: string | null): void {
    const trimmed = (explanation ?? '').trim();
    const already = this.latestExplanation?.trim();
    console.warn('[📤 setExplanationText CALLED]', explanation);
  
    if (this.explanationLocked && trimmed === '') {
      console.warn('[🛡️ Blocked reset: explanation is locked]');
      return;
    }
  
    if (trimmed === already) {
      console.log('[🛡️ Prevented duplicate emit]');
      return;
    }
  
    console.log(`[📤 setExplanationText] Emitting:`, trimmed);
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

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = {};

    for (const [index, explanation] of explanations.entries()) {
      this.explanationTexts[index] = explanation;
    }    
  }

  initializeFormattedExplanations(explanations: { questionIndex: number; explanation: string }[]): void {
    this.formattedExplanations = {}; // Clear existing data

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

  // Method to sanitize explanation text
  private sanitizeExplanation(explanation: string): string {
    // Trim and remove unwanted characters
    return explanation.trim().replace(/<[^>]*>/g, '');
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
    
    this.explanationsUpdated.next(this.formattedExplanations);
  }

  getCorrectOptionIndices(question: QuizQuestion): number[] {
    if (!question || !Array.isArray(question.options)) {
      console.error("Invalid question or options:", question);
      return [];
    }

    return question.options
      .map((option, index) => option.correct ? index + 1 : null)
      .filter((index): index is number => index !== null);
  }

  /* formatExplanation(question: QuizQuestion, correctOptionIndices: number[], explanation: string): string {
    if (correctOptionIndices.length > 1) {
      question.type = QuestionType.MultipleAnswer;

      const optionsText = correctOptionIndices.length > 2 
        ? `${correctOptionIndices.slice(0, -1).join(', ')} and ${correctOptionIndices.slice(-1)}` 
        : correctOptionIndices.join(' and ');

      return `Options ${optionsText} are correct because ${explanation}`;
    } else if (correctOptionIndices.length === 1) {
      question.type = QuestionType.SingleAnswer;
      return `Option ${correctOptionIndices[0]} is correct because ${explanation}`;
    } else {
      return 'No correct option selected...';
    }
  } */
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
        .map((opt, i) => (opt?.correct ? i + 1 : -1))  // +1 so text says “Option 2” etc.
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
      this.formattedExplanations$[questionIndex] = 
        new BehaviorSubject<string | null>(null);
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

  /* emitExplanationIfNeeded(rawExplanation: string): void {
    console.log('[🔍 Checking explanation state before emission]', Date.now());
    console.log('[📤 Emitting explanation immediately:', rawExplanation, Date.now());

    const trimmed = rawExplanation?.trim() || 'No explanation available';
  
    const latestExplanation = this.latestExplanation?.trim();
    const formattedExplanation = this.formattedExplanationSubject.getValue()?.trim();
  
    console.log('[🔍 emitExplanationIfNeeded] Checking explanation state:', {
      trimmed,
      latestExplanation,
      formattedExplanation
    });
  
    const shouldEmit = trimmed !== latestExplanation || !formattedExplanation;
  
    if (shouldEmit) {
      console.log('[📤 Emitting explanation immediately:', trimmed);
  
      // Emit to observable and update state
      this.formattedExplanationSubject.next(trimmed);
      this.setExplanationText(trimmed);
      this.setShouldDisplayExplanation(true);
      this.lockExplanation();
  
      console.log('[✅ Explanation emitted and locked:', trimmed);
    } else {
      console.log('[🛑 Explanation already set and formatted, skipping emit');
    }
  } */
  /* emitExplanationIfNeeded(rawExplanation: string, questionIndex: number): void {
    const trimmed = rawExplanation?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'no explanation available') {
      console.log('[⏭️ Skipping empty or default explanation]');
      return;
    }
  
    // Check if the current explanation text for this index is already set
    const existingExplanation = this.explanationTexts[questionIndex]?.trim();
    const formattedExplanation = this.formattedExplanationSubject.getValue()?.trim();
  
    // Emit only if the new explanation differs or we haven't emitted yet
    const shouldEmit = trimmed !== existingExplanation || !formattedExplanation;
  
    if (shouldEmit) {
      console.log('[📤 Emitting explanation for Q' + questionIndex + ']:', trimmed);
  
      // Save the explanation for this specific question index
      this.explanationTexts[questionIndex] = trimmed;
  
      this.formattedExplanationSubject.next(trimmed);
      this.setExplanationText(trimmed);
      this.setShouldDisplayExplanation(true);
      this.lockExplanation();
  
      this.latestExplanation = trimmed;
    } else {
      console.log('[🛑 Explanation already emitted or same, skipping]');
    }
  } */
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
  
      this.explanationTexts[questionIndex] = trimmed;
      this.formattedExplanationSubject.next(trimmed);
      this.setExplanationText(trimmed);
      this.setShouldDisplayExplanation(true);
      this.lockExplanation();
      this.latestExplanation = trimmed;
    } else {
      console.log(`[🛑 Skipping redundant emit for Q${questionIndex}]`);
    }
  }  

  public setIsExplanationTextDisplayed(isDisplayed: boolean): void {
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  public setShouldDisplayExplanation(shouldDisplay: boolean): void {
    const current = this.shouldDisplayExplanationSource.getValue();
  
    if (current === shouldDisplay) return;
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }
  
  public triggerExplanationEvaluation(): void {
    console.log('[📢 triggerExplanationEvaluation] Triggered');
  
    const currentExplanation = this.formattedExplanationSubject.getValue()?.trim();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();
  
    console.log('[🔍 Explanation Evaluation State]', {
      currentExplanation,
      shouldShow,
    });
  
    if (shouldShow && currentExplanation) {
      console.log(`[✅ Explanation Ready to Display]: "${currentExplanation}"`);
      this.explanationTrigger.next();
      this.setExplanationText(currentExplanation);
    } else {
      console.warn('[⏭️ triggerExplanationEvaluation] Skipped — Missing explanation or display flag');
    }
    
    console.log('[✅ Change Detection Applied after Explanation Evaluation]');
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
    // this.explanationText$.next('');
    this.isExplanationDisplayedSource.next(false); // set to false when explanation is hidden
  }

  resetStateBetweenQuestions(): void {
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }

  resetExplanationState(): void {
    this.formattedExplanationSubject.next('');
    this.explanationTexts = {};
  
    this.shouldDisplayExplanationSource.next(false);
    this.isExplanationTextDisplayedSource.next(false);
  }  

  resetProcessedQuestionsState(): void {
    this.processedQuestions = new Set<string>();
  }

  setResetComplete(value: boolean): void {
    this.resetCompleteSubject.next(value);
  }

  /* emitExplanationSafely(
    explanationText: string,
    lockedIndex: number,
    lockedQuestionText: string,
    currentQuestion: QuizQuestion | null,
    emitFn: (text: string, index: number) => void
  ): void {
    const currentText = currentQuestion?.questionText?.trim();
  
    // Guard against invalid explanation
    const trimmed = explanationText?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'no explanation available') {
      console.log(`[⏭️ emitExplanationSafely] Skipping empty/default explanation for Q${lockedIndex}`);
      return;
    }
  
    // Prevent cross-question leakage
    if (!currentText || currentText !== lockedQuestionText) {
      console.warn(
        `[⛔ Skipping stale explanation for Q${lockedIndex}]`,
        `Expected: "${lockedQuestionText}", Got: "${currentText}"`
      );
      return;
    }
  
    // ✅ Safe to emit
    console.log(`[✅ Emitting safe explanation for Q${lockedIndex}]`, trimmed);
    emitFn(trimmed, lockedIndex);
  } */
  emitExplanationIfNeededStrict({
    explanationText,
    questionIndex,
    questionText,
    expectedQuestionText
  }: {
    explanationText: string;
    questionIndex: number;
    questionText: string;              // From the locked current question
    expectedQuestionText: string;     // From the component calling this
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
      console.log(`[📤 Emitting explanation for Q${questionIndex}]:`, trimmed);
  
      this.explanationTexts[questionIndex] = trimmed;
      this.formattedExplanationSubject.next(trimmed);
      this.setExplanationText(trimmed);
      this.setShouldDisplayExplanation(true);
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
}