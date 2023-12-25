import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';

import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false'
}

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService implements OnDestroy {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanations: string[] = [];
  explanationTexts: Record<number, BehaviorSubject<string>> = {};
  currentQuestionExplanation: string | null = null;
  maxIndex = -1;

  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  processedQuestions: Set<string> = new Set<string>();

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

  nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private previousExplanationTextSource = new BehaviorSubject<string>('');
  previousExplanationText$: Observable<string> =
    this.previousExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(
    false
  );
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ =
    this.shouldDisplayExplanationSource.asObservable();

  lastDisplayedExplanationText = '';

  private destroyed$ = new Subject<void>();

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  initializeExplanations(explanations: string[]): void {
    this.explanationTexts = explanations.reduce((acc, exp, index) => {
      acc[index] = new BehaviorSubject<string>(exp);
      return acc;
    }, {});
  
    this.maxIndex = Object.keys(this.explanationTexts).length - 1;
  }

  updateExplanationForIndex(index: number, explanation: string): void {
    if (!this.explanationTexts[index]) {
      // Initialize the BehaviorSubject at the given index
      this.explanationTexts[index] = new BehaviorSubject<string>(explanation);
    } else {
      // If it already exists, update the value using next
      this.explanationTexts[index].next(explanation);
    }
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    // Ensure that index is within the valid range
    if (index < 0) {
      console.warn(`Invalid index: ${index}, must be greater than or equal to 0`);
      return;
    }

    // Ensure that the explanationTexts array is initialized
    if (!this.explanationTexts) {
      this.explanationTexts = [];
    }

    // Ensure that the element at index is initialized and is an instance of BehaviorSubject
    if (!this.explanationTexts[index] || !(this.explanationTexts[index] instanceof BehaviorSubject)) {
      // Initialize the BehaviorSubject if it doesn't exist or is not an instance of BehaviorSubject
      this.explanationTexts[index] = new BehaviorSubject<string>(explanation);
    }

    // Update the existing BehaviorSubject with the new explanation
    this.explanationTexts[index].next(explanation);
  }

  getExplanationTextForQuestionIndex(index: number | string): Observable<string | undefined> {
    const numericIndex = typeof index === 'number' ? index : parseInt(index, 10);

    // Check if the index is within the valid range
    if (numericIndex < 0 || numericIndex > this.maxIndex) {
      console.warn(`Invalid index: ${numericIndex}, must be within the valid range`);
      return of(undefined);
    }

    const explanationSubject = this.explanationTexts[numericIndex];
    if (explanationSubject instanceof BehaviorSubject) {
      return explanationSubject.asObservable();
    } else {
      console.warn(`No explanation text found at index ${index}`);
      return of(undefined);
    }
  }

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = explanations.map(explanation => new BehaviorSubject(explanation));
  }

  fetchExplanationTexts(): string[] {
    return Object.values(this.explanationTexts).map(subject => subject.value);
  }

  // Retrieve explanation for a specific question
  getExplanationForQuestion(questionId: string | number): string | undefined {
    return this.explanationTexts[questionId];
  }

  getFormattedExplanation$() {
    return this.formattedExplanation$.asObservable();
  }

  getFormattedExplanationObservable(questionIndex: number): Observable<string> {
    // Verify that the questionIndex is within the bounds of the array
    if (questionIndex < 0 || questionIndex >= this.formattedExplanations$.length) {
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<string>('');
    }
    return this.formattedExplanations$[questionIndex].asObservable();
  }

  updateFormattedExplanation(questionIndex: number, formattedExplanation: string): void {
    // Verify that the index is valid and the array is initialized properly
    if (!this.formattedExplanations$[questionIndex]) {
      // If the observable at the given index is not initialized, initialize it
      this.formattedExplanations$[questionIndex] = new Subject<string>();
    }
  
    // Update the explanation text based on the provided question index
    this.formattedExplanations$[questionIndex].next(formattedExplanation);
  }

  formatExplanationText(question: QuizQuestion, questionIndex: number): { questionIndex: number, explanation: string } {
    const questionKey = JSON.stringify(question);
    if (!this.isQuestionValid(question)) {
      console.log('Skipping already processed or invalid question:', question.questionText);
      return { questionIndex, explanation: '' };
    }
  
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    if (!this.isCurrentQuestion(question)) {
      return { questionIndex, explanation: '' };
    }
  
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices);
    this.syncFormattedExplanationState(questionIndex, formattedExplanation);
    this.setFormattedExplanation(formattedExplanation);
    this.processedQuestions.add(questionKey);
  
    return { questionIndex, explanation: formattedExplanation };
  }

  private isQuestionValid(question: QuizQuestion): boolean {
    return question && question.questionText && !this.processedQuestions.has(question.questionText);
  }
  
  private getCorrectOptionIndices(question: QuizQuestion): number[] {
    return question.options
      .map((option, index) => option.correct ? index + 1 : null)
      .filter(index => index !== null);
  }
  
  private formatExplanation(question: QuizQuestion, correctOptionIndices: number[]): string {
    if (correctOptionIndices.length > 1) {
      question.type = QuestionType.MultipleAnswer;
      return `Options ${correctOptionIndices.join(' and ')} are correct because ${question.explanation}`;
    } else if (correctOptionIndices.length === 1) {
      question.type = QuestionType.SingleAnswer;
      return `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
    } else {
      return 'No correct option selected...';
    }
  }
  
  private syncFormattedExplanationState(questionIndex: number, formattedExplanation: string): void {
    if (!this.formattedExplanations$[questionIndex]) {
      // Initialize the BehaviorSubject if it doesn't exist at the specified index
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<string | null>(null);
    }
  
    // Access the BehaviorSubject at the specified questionIndex
    const subjectAtIndex = this.formattedExplanations$[questionIndex];
  
    if (subjectAtIndex) {
      subjectAtIndex.next(formattedExplanation);
      
      // Update the formattedExplanations array
      const formattedExplanationObj: FormattedExplanation = { questionIndex, explanation: formattedExplanation };
      this.formattedExplanations[questionIndex] = formattedExplanationObj;
      this.updateExplanationForIndex(questionIndex, formattedExplanation);
    } else {
      console.error(`No element at index ${questionIndex} in formattedExplanations$`);
    }
  }  

  setCurrentQuestionExplanation(explanation: string) {
    this.currentQuestionExplanation = explanation;
  }

  private isCurrentQuestion(question: QuizQuestion): boolean {
    return this.currentQuestionExplanation === question.explanation;
  }
    
  setFormattedExplanation(newExplanation: string): void {
    this.formattedExplanation$.next(newExplanation);
  }

  toggleExplanationDisplay(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  setNextExplanationText(explanationText: string): void {
    try {
      this.nextExplanationTextSource.next(explanationText);
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
  }

  setPreviousExplanationText(explanationText: string): void {
    this.previousExplanationTextSource.next(explanationText);
  }

  getNextExplanationText(): Observable<string> {
    return this.nextExplanationText$;
  }

  setIsExplanationTextDisplayed(isDisplayed: boolean): void {
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  resetStateBetweenQuestions(): void {
    this.clearExplanationText();
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }  

  clearExplanationText(): void {
    this.explanationText$.next('');
    this.nextExplanationTextSource.next('');
  }

  resetExplanationState() {
    this.formattedExplanation$.next('');
    this.explanationTexts = {};
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
    this.nextExplanationTextSource.next('');
  }

  resetProcessedQuestionsState() {
    this.processedQuestions = new Set<string>();
  } 
}
