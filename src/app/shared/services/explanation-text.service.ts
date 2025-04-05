import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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

  processedQuestions: Set<string> = new Set<string>();
  currentQuestionExplanation: string | null = null;
  
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

  private latestExplanation = '';

  constructor() {}

  updateExplanationText(question: QuizQuestion): void {
    this.explanationSubject.next(question);
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  prepareExplanationText(question: QuizQuestion): string {
    // Assuming question has an 'explanation' property or similar
    return question.explanation || 'No explanation available';
  }

  /* setExplanationText(explanation: string): void {
    const trimmed = (explanation ?? '').trim();
  
    if (trimmed) {
      this.explanationText$.next(trimmed);
      this.isExplanationDisplayedSource.next(true);
  
      console.log('[✅ setExplanationText] Explanation emitted:', trimmed);
      console.log('[🧠 shouldDisplayExplanation set to TRUE]');
    } else {
      console.warn('[⚠️ setExplanationText] No valid explanation to emit');
      this.explanationText$.next(''); // Still emit empty string to clear stale data if needed
      this.isExplanationDisplayedSource.next(false);
    }
  }  */
  /* setExplanationText(explanation: string): void {
    const trimmed = (explanation ?? '').trim();
    this.latestExplanation = trimmed; // ⬅️ Store the latest explanation
  
    if (trimmed) {
      this.explanationText$.next(trimmed);
      this.isExplanationDisplayedSource.next(true);
  
      console.log('[✅ setExplanationText] Explanation emitted:', trimmed);
      console.log('[🧠 shouldDisplayExplanation set to TRUE]');
    } else {
      console.warn('[⚠️ setExplanationText] No valid explanation to emit');
      this.explanationText$.next(''); // Clear stale data
      this.isExplanationDisplayedSource.next(false);
    }
  } */
  /* setExplanationText(explanation: string | null): void {
    const trimmed = (explanation ?? '').trim();
  
    // ✅ Set the plain string version (used by the display logic)
    this.explanationText$.next(trimmed || 'No explanation available');
  
    // ✅ Also emit a mock QuizQuestion object if needed elsewhere
    this.explanationSubject.next({
      questionText: '', // optional if not needed
      options: [],
      explanation: trimmed,
      type: QuestionType.SingleAnswer // or whatever default works for your app
    });
  
    console.log('[✅ setExplanationText] Emitted:', trimmed);
  } */
  /* setExplanationText(explanation: string | null): void {
    const trimmed = (explanation ?? '').trim();
    this.latestExplanation = trimmed;
  
    // ✅ Emit trimmed explanation to display observable
    this.explanationText$.next(trimmed || 'No explanation available');
  
    // ✅ Emit full QuizQuestion-like object if used elsewhere
    this.explanationSubject.next({
      questionText: '', // optional placeholder
      options: [],
      explanation: trimmed,
      type: QuestionType.SingleAnswer // or whatever default your app expects
    });
  
    // ✅ Update explanation display flag (optional, based on your design)
    this.isExplanationDisplayedSource.next(!!trimmed);
  
    console.log('[✅ setExplanationText] Emitted:', trimmed);
  } */
  /* public setExplanationText(explanation: string | null): void {
    const trimmed = (explanation ?? '').trim();
  
    if (!trimmed) {
      console.warn('[❌ BLOCKED empty explanation emission]');
      return;
    }
  
    this.latestExplanation = trimmed;
    this.explanationText$.next(trimmed);
  
    console.log('[✅ setExplanationText] Explanation emitted:', trimmed);
  } */
  public setExplanationText(explanation: string | null): void {
    const trimmed = (explanation ?? '').trim();
  
    if (!trimmed) {
      console.warn('[❌ ETS: BLOCKED empty explanation]');
      return;
    }
  
    const state = this.quizStateService.getDisplayState?.();
    if (state?.mode !== 'explanation') {
      console.warn('[❌ ETS: BLOCKED explanation — not in explanation mode]', state);
      return;
    }
  
    this.latestExplanation = trimmed;
    this.explanationText$.next(trimmed);
  
    console.log('[✅ ETS: Explanation emitted]:', trimmed);
  }

  getLatestExplanation(): string {
    console.log('[🐞 getLatestExplanation()] returning:', this.latestExplanation);
    return this.latestExplanation;
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
    console.log('[🧪 getFormattedExplanationTextForQuestion called with]:', questionIndex);
  
    if (typeof questionIndex !== 'number' || isNaN(questionIndex)) {
      console.error('[❌ Invalid questionIndex — must be a number]:', questionIndex);
      this.formattedExplanationSubject.next('No explanation available');
      return this.formattedExplanation$;
    }
  
    const entry = this.formattedExplanations[questionIndex];
  
    if (!entry) {
      console.error(`[❌] Q${questionIndex} not found in formattedExplanations`);
      this.formattedExplanationSubject.next('No explanation available');
      return this.formattedExplanation$;
    }
  
    const explanation = entry.explanation?.trim();
  
    if (explanation) {
      console.log(`[✅ Explanation for Q${questionIndex}]:`, explanation);
      this.formattedExplanationSubject.next(explanation);
    } else {
      console.warn(`[⚠️ No valid explanation for Q${questionIndex}]`);
      this.formattedExplanationSubject.next('No explanation available');
    }
  
    return this.formattedExplanation$;
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
      console.log(`Processing explanation for questionIndex ${questionIndex}:`, explanation);
    
      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        console.warn(`Invalid questionIndex: ${questionIndex}. It should be a non-negative number.`);
        continue;
      }
    
      if (typeof explanation !== 'string' || !explanation.trim()) {
        console.warn(`Invalid or empty explanation for questionIndex ${questionIndex}:`, explanation);
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: 'No explanation available' };
      } else {
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: explanation.trim() };
        console.log("Formatted Explanation", this.formattedExplanations[questionIndex]);
      }
    }

    // Notify subscribers about the updated explanations
    this.explanationsUpdated.next(this.formattedExplanations);
    console.log('Formatted explanations initialized:', this.formattedExplanations);
    console.log('Explanations updated notification sent.');
  }

  formatExplanationText(question: QuizQuestion, questionIndex: number): Observable<{ questionIndex: number, explanation: string }> {
    if (!this.isQuestionValid(question) || !this.isCurrentQuestion(question)) {
      return of({ questionIndex, explanation: '' });
    }

    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices, question.explanation);

    this.storeFormattedExplanation(questionIndex, formattedExplanation, question);
    this.syncFormattedExplanationState(questionIndex, formattedExplanation);
    this.updateFormattedExplanation(formattedExplanation);

    const questionKey = JSON.stringify(question);
    this.processedQuestions.add(questionKey);

    return of({ questionIndex, explanation: formattedExplanation });
  }

  updateFormattedExplanation(explanation: string): void {
    console.log('[💬 updateFormattedExplanation] explanation emitted:', explanation);
    const trimmed = explanation?.trim();
  
    if (!trimmed) {
      console.warn('[💬 updateFormattedExplanation] ❌ Ignoring empty or blank explanation');
      return;
    }
  
    console.log('[💬 updateFormattedExplanation] ✅ Emitting explanation:', trimmed);
    console.log('[💬 Previous explanation]', this.formattedExplanationSubject.getValue());
  
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

    const sanitizedExplanation = this.sanitizeExplanation(explanation);
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
    return this.getFormattedExplanationTextForQuestion(questionIndex).pipe(
      switchMap((explanationText: string) =>
        of(explanationText ? explanationText : 'No explanation available')
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
    console.log('[🧩 setShouldDisplayExplanation] value emitted:', shouldDisplay);
    console.log('[📢 setShouldDisplayExplanation] called with:', shouldDisplay);
  
    const current = this.shouldDisplayExplanationSource.getValue();
    if (current !== shouldDisplay) {
      this.shouldDisplayExplanationSource.next(shouldDisplay);
      console.log('[💬 shouldDisplayExplanation$ EMITTED]', shouldDisplay);
    } else {
      console.log('[⏸️ shouldDisplayExplanation$ NOT emitted - value unchanged]');
    }
  }
  
  triggerExplanationEvaluation(): void {
    const currentExplanation = this.formattedExplanationSubject.getValue();
    const shouldShow = this.shouldDisplayExplanationSource.getValue();
  
    if (shouldShow && currentExplanation?.trim()) {
      console.log('[triggerExplanationEvaluation] ✅ Triggering explanation logic');
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

  private isCurrentQuestion(question: QuizQuestion): boolean {
    return this.currentQuestionExplanation === question.explanation;
  }

  resetExplanationText(): void {
    // this.explanationText$.next('');
    this.isExplanationDisplayedSource.next(false); // Set to false when explanation is hidden
  }

  resetStateBetweenQuestions(): void {
    // this.clearExplanationText();
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }

  /* clearExplanationText(): void {
    this.explanationText$.next('');
  } */

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