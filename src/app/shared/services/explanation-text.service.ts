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

  setExplanationText(explanation: string): void {
    this.explanationText$.next(explanation);
    this.isExplanationDisplayedSource.next(true); // Set to true when explanation is displayed
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    if (index < 0) {
      console.warn(`Invalid index: ${index}, must be greater than or equal to 0`);
      return;
    }

    if (this.explanationTexts[index] !== explanation) {
      this.explanationTexts[index] = explanation; // set the explanation for the specific index
      this.explanationText$.next(explanation);
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
  
  getFormattedExplanationTextForQuestion(index: number): Observable<string> {
    if (index in this.formattedExplanations) {
      const formattedExplanation = this.formattedExplanations[index];
  
      if (formattedExplanation?.explanation?.trim()) {
        console.log(`[DEBUG] ✅ Explanation found for Q${index}:`, formattedExplanation.explanation);
        this.formattedExplanationSubject.next(formattedExplanation.explanation);
      } else {
        console.warn(`[DEBUG] ⚠️ No valid explanation text found for Q${index}`);
        this.formattedExplanationSubject.next('');
      }
    } else {
      console.error(`[DEBUG] ❌ Q${index} is out of bounds or no explanation stored.`);
      this.formattedExplanationSubject.next('');
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
    this.explanationTrigger.next();
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
    this.explanationText$.next('');
    this.isExplanationDisplayedSource.next(false); // Set to false when explanation is hidden
  }

  resetStateBetweenQuestions(): void {
    this.clearExplanationText();
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }

  clearExplanationText(): void {
    this.explanationText$.next('');
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