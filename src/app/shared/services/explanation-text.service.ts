import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class ExplanationTextService {
  private explanationSubject = new BehaviorSubject<QuizQuestion | null>(null);
  explanation$ = this.explanationSubject.asObservable();

  explanationText$: BehaviorSubject<string | null> = 
    new BehaviorSubject<string | null>('');
  explanationTexts: Record<number, string> = {};
  
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  formattedExplanationSubject = new BehaviorSubject<string>('');
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

  processedQuestions: Set<string> = new Set<string>();
  currentQuestionExplanation: string | null = null;
  latestExplanation = '';
  explanationsInitialized = false;
  private explanationLocked = false;

  constructor() {}

  updateExplanationText(question: QuizQuestion): void {
    this.explanationSubject.next(question);
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
  
    // If explanation is locked and value is blank, don't overwrite
    if (this.explanationLocked && trimmed === '') {
      console.warn('[🛡️ Blocked reset: explanation is locked]');
      return;
    }
  
    // Prevent emitting if same as last one
    if (trimmed === this.latestExplanation) {
      console.log('[🛡️ Prevented duplicate emit]');
      return;
    }
  
    this.latestExplanation = trimmed;
  
    console.log('[setExplanationText] ✅ Emitting to explanationText$ and formattedExplanationSubject:', trimmed);
  
    // 🔥 These two are required for explanation text to show up
    this.explanationText$.next(trimmed);               // For internal logic
    this.formattedExplanationSubject.next(trimmed);    // For template combinedText$
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

  formatExplanation(question: QuizQuestion, correctOptionIndices: number[], explanation: string): string {
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

  setIsExplanationTextDisplayed(isDisplayed: boolean): void {
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    const current = this.shouldDisplayExplanationSource.getValue();
  
    if (current === shouldDisplay) return;
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }
  /* setShouldDisplayExplanation(shouldDisplay: boolean): void {
    console.log('[📢 setShouldDisplayExplanation] called with:', shouldDisplay);
  
    if (!shouldDisplay) {
      console.trace('[🛑 Explanation HIDE triggered]');
    }
  
    const current = this.shouldDisplayExplanationSource.getValue();
  
    if (current !== shouldDisplay) {
      console.log('[🧩 setShouldDisplayExplanation] value emitted:', shouldDisplay);
      this.shouldDisplayExplanationSource.next(shouldDisplay);
    } else {
      console.log('[⏸️ shouldDisplayExplanation$ NOT emitted - value unchanged]');
    }
  } */
  
  triggerExplanationEvaluation(): void {
    const currentExplanation = this.formattedExplanationSubject.getValue();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();
  
    if (shouldShow && currentExplanation?.trim()) {
      this.explanationTrigger.next();
    } else {
      console.warn('[triggerExplanationEvaluation] ⛔️ Skipped — missing explanation or display flag');
    }
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
}