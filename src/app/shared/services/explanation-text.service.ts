import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  private currentQuestionExplanation: string | null = null;
  private maxIndex: number = -1;

  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  // formattedExplanations: FormattedExplanation[] = [];
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanations$: Subject<string>[] = [];
  processedQuestions: Set<string> = new Set<string>();
  questionIndexCounter = 0;

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

    // Subscribe to the observable with takeUntil
    this.formattedExplanation$
      .pipe(takeUntil(this.destroyed$))
      .subscribe((value) => {
        // Handle the value
        console.log('Received new formatted explanation:', value);
      });
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
    console.log("ET:::", this.explanationTexts);
  
    this.maxIndex = Object.keys(this.explanationTexts).length - 1;
  }


  storeFormattedExplanations(formattedExplanations: Record<number, string>) {
    this.formattedExplanations = formattedExplanations;
  }

  updateExplanationForIndex(index: number, explanation: string): void {
    if (this.explanationTexts[index]) {
      this.explanationTexts[index].next(explanation);
    } else {
      this.explanationTexts[index] = new BehaviorSubject<string>(explanation);
    }
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    console.log(`Setting explanation for index ${index}: ${explanation}`);

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

    console.log(`Set explanation for index ${index}::>> ${explanation}`);
  }

  getExplanationTextForQuestionIndex(index: number | string): Observable<string | undefined> {
    console.log(`Retrieving explanation for index: ${index}`);
    const numericIndex = typeof index === 'number' ? index : parseInt(index, 10);
    console.log(`Trying to get explanation for index::>> ${numericIndex}`);

    // Check if the index is within the valid range
    if (numericIndex < 0 || numericIndex > this.maxIndex) {
      console.warn(`Invalid index: ${numericIndex}, must be within the valid range`);
      return of(undefined);
    }

    const explanationSubject = this.explanationTexts[numericIndex];
    console.log(`Value at index ${numericIndex}:`, explanationSubject);
    if (explanationSubject instanceof BehaviorSubject) {
      console.log(`Got explanation for index ${numericIndex}::>> ${explanationSubject.value}`);
      return explanationSubject.asObservable();
    } else {
      console.warn(`Explanation text for index ${numericIndex} is not a BehaviorSubject.`);
      return of(undefined);
    }
  }

  // Function to update explanations based on question ID or index
  updateExplanationForQuestion(
    questionId: string | number,
    explanation: string
  ): void {
    this.explanationTexts[questionId] = explanation;
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
    console.log(`Formatting explanation for question index ${questionIndex}:`, question);
    console.log("QI", questionIndex);
    const questionKey = JSON.stringify(question);
    if (!question || !question.questionText || this.processedQuestions.has(question.questionText)) {
      console.log('Skipping already processed or invalid question:', question.questionText);
      return { questionIndex, explanation: '' };
    }

    const correctOptionIndices: number[] = question.options
      .map((option, index) => (option.correct ? index + 1 : null))
      .filter(index => index !== null);

    console.log("Entering isCurrentQuestion block");
    if (this.isCurrentQuestion(question)) {
      let formattedExplanation = '';

      if (correctOptionIndices.length > 1) {
        question.type = QuestionType.MultipleAnswer;
        formattedExplanation = `Options ${correctOptionIndices.join(' and ')} are correct because ${question.explanation}`;
      } else if (correctOptionIndices.length === 1) {
        question.type = QuestionType.SingleAnswer;
        formattedExplanation = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
      } else {
        formattedExplanation = 'No correct option selected...';
      }

      console.log("FE BEFORE:>>", formattedExplanation);
      if (formattedExplanation) {
        this.currentQuestionExplanation = formattedExplanation;
        console.log("CQE", this.currentQuestionExplanation);
      }

      // Add the formatted explanation to the array
      // this.formattedExplanations$[questionIndex] = formattedExplanation;

      // Emit the entire array of formatted explanations
      // this.formattedExplanations$.next([...this.formattedExplanations]);

      // Create a FormattedExplanation object
      const formattedExplanationObj: FormattedExplanation = {
        questionIndex: questionIndex,
        explanation: formattedExplanation
      };

      // Update the formatted explanation for the current question index
      this.formattedExplanations[questionIndex] = formattedExplanationObj;
      console.log("FEA", this.formattedExplanations[questionIndex]);

      // this.updateExplanationForIndex(questionIndex, formattedExplanation);

      this.setFormattedExplanation(formattedExplanation);
      this.processedQuestions.add(questionKey);

      return {
        questionIndex: questionIndex,
        explanation: formattedExplanation
      };
    } else {
      console.log("Question is not the current question");
    }
  }

  public setCurrentQuestionExplanation(explanation: string) {
    this.currentQuestionExplanation = explanation;
  }
  
  private isCurrentQuestion(question: QuizQuestion): boolean {
    // Check if the provided 'question' and 'currentQuestionExplanation' are defined and match
    console.log('Current Question Explanation:', this.currentQuestionExplanation);
    return (
      this.currentQuestionExplanation !== null &&
      this.currentQuestionExplanation !== undefined &&
      question.explanation !== null &&
      question.explanation !== undefined &&
      question.explanation === this.currentQuestionExplanation
    );
  }
    
  // Inside explanationTextService
  setFormattedExplanation(newExplanation: string): void {
    console.log(`Updating formatted explanation: ${newExplanation}`);
    this.formattedExplanation$.next(newExplanation);
  }

  // Function to set or update the formatted explanation for a question
  setFormattedExplanationForQuestion(
    questionIndex: number,
    explanation: string
  ): void {
    const existingIndex = this.formattedExplanations.findIndex(
      (exp) => exp.questionIndex === questionIndex
    );

    if (existingIndex > -1) {
      this.formattedExplanations[existingIndex].explanation = explanation;
    } else {
      this.formattedExplanations.push({ questionIndex, explanation });
    }
  }

  // Function to retrieve the formatted explanation for a question
  /* getFormattedExplanationForQuestion(
    questionIndex: number
  ): string | undefined {
    const explanationObj = this.formattedExplanations.find(
      (exp) => exp.questionIndex === questionIndex
    );

    return explanationObj ? explanationObj.explanation : undefined;
  } */

  getFormattedExplanationForQuestion(questionIndex: number): string | undefined {
    // Retrieve the explanation object
    const formattedExplanationObj = this.formattedExplanations[questionIndex];

    // Check if the explanation object exists and has an 'explanation' property
    if (formattedExplanationObj && formattedExplanationObj.explanation) {
      return formattedExplanationObj.explanation;
    } else {
      return undefined;
    }
  }

  // Function to aggregate the formatted explanations
  aggregateFormattedExplanations(questions: QuizQuestion[]): string[] {
    const formattedExplanations: string[] = [];

    for (const question of questions) {
      const explanation = this.getFormattedExplanationForQuestion(
        questions.indexOf(question)
      );
      formattedExplanations.push(explanation || '');
    }

    return formattedExplanations;
  }

  updateExplanationTextForCurrentAndNext(
    currentExplanationText: string,
    nextExplanationText: string
  ) {
    try {
      this.currentExplanationTextSource.next(currentExplanationText);
      this.nextExplanationTextSource.next(nextExplanationText);
      console.log(
        'Updated explanation text for current question:',
        currentExplanationText
      );
      console.log(
        'Updated explanation text for next question:',
        nextExplanationText
      );
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
  }

  toggleExplanationDisplay(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  setNextExplanationText(explanationText: string): void {
    try {
      console.log('Setting next explanation text:', explanationText);
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
    console.log('Setting isExplanationTextDisplayed to', isDisplayed);
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  getLastDisplayedExplanationText(): string {
    return this.lastDisplayedExplanationText;
  }

  getExplanationObservable(questionIndex: number): BehaviorSubject<string> {
    if (!this.explanationTexts[questionIndex]) {
      this.explanationTexts[questionIndex] = new BehaviorSubject<string>('');
    }
    return this.explanationTexts[questionIndex];
  }

  resetStateBetweenQuestions(): void {
    console.log('Resetting explanation state between questions...');
    this.clearExplanationText();
    this.resetExplanationState();
    this.resetProcessedQuestionsState();
  }  

  clearExplanationText(): void {
    console.log('clearExplanationText() called');
    this.explanationText$.next('');
    this.nextExplanationTextSource.next('');
  }

  resetExplanationState() {
    console.log('resetExplanationState() called');
    this.questionIndexCounter = 0;
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
