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
  providedIn: 'root'
})
export class ExplanationTextService implements OnDestroy {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanationTexts: Record<number, BehaviorSubject<string>> = {};
  currentQuestionExplanation: string | null = null;
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  processedQuestions: Set<string> = new Set<string>();

  nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private previousExplanationTextSource = new BehaviorSubject<string>('');
  previousExplanationText$: Observable<string> =
    this.previousExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ =
    this.shouldDisplayExplanationSource.asObservable();

  private destroyed$ = new Subject<void>();

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);

    this.explanationTexts = {};
    this.explanationTexts[2] = new BehaviorSubject("Temporary explanation for Q3");
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
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    // Ensure that index is within the valid range
    if (index < 0) {
      console.warn(`Invalid index: ${index}, must be greater than or equal to 0`);
      return;
    }
  
    // Ensure that the explanationTexts object is initialized
    if (!this.explanationTexts) {
      this.explanationTexts = {};
    }
  
    // Check if there is already a BehaviorSubject at the given index
    if (!this.explanationTexts[index]) {
      // Initialize the BehaviorSubject if it doesn't exist
      this.explanationTexts[index] = new BehaviorSubject<string>(explanation);
    } else {
      // Update the existing BehaviorSubject with the new explanation
      this.explanationTexts[index].next(explanation);
    }
  }  

  /* getExplanationTextForQuestionIndex(index) {
    const numericIndex = typeof index === 'number' ? index : parseInt(index, 10);
    console.log('Numeric Index:', numericIndex);
    console.log('Explanation Texts:', this.explanationTexts);

    const explanationTextsKeys = Object.keys(this.explanationTexts);
    const textsLength = explanationTextsKeys.length;
  
    if (isNaN(numericIndex) || numericIndex < 0 || numericIndex >= textsLength) {
        console.error(`Invalid index: ${numericIndex}. Index not found in explanation texts.`);
        return of(undefined);
    }

    const explanationObject = this.explanationTexts[numericIndex];
  
    if (explanationObject instanceof BehaviorSubject) {
        return explanationObject.asObservable();
    } else {
        console.warn(`No explanation text found at index ${numericIndex}. Current explanation texts:`, this.explanationTexts);
        return of(undefined);
    }
  } */

  getExplanationTextForQuestionIndex(index: number): Observable<string> {
    console.log("Attempting to retrieve explanation for index", index);
    console.log("Current state of explanationTexts:", this.explanationTexts);

    const explanationObject = this.explanationTexts[index];
    if (!explanationObject) {
        console.error(`No BehaviorSubject found at index ${index}.`);
        return of('Explanation not found.');
    }

    return explanationObject.asObservable();
  }

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = {};

    /* explanations.forEach((explanation, index) => {
        const text = explanation || `Default explanation for question ${index + 1}`;
        this.explanationTexts[index] = new BehaviorSubject(text);
        console.log(`Initialized explanation for index ${index}:`, text);
    }); */

    this.explanationTexts = {
      0: new BehaviorSubject("Explanation for question 1"),
      1: new BehaviorSubject("Explanation for question 2"),
      2: new BehaviorSubject("Explanation for question 3"),
      3: new BehaviorSubject("Explanation for question 4"),
      4: new BehaviorSubject("Explanation for question 5")
    };

    console.log("Final explanation texts:", this.explanationTexts);
  }

  fetchQuizExplanations(quizId: string): string[] {
    const quizExplanations = this.explanationTexts[quizId];
    if (!quizExplanations) {
        console.error(`No explanations found for quiz with ID: ${quizId}`);
        return [];
    }
    return quizExplanations.map(subject => subject.value);
  }

  // remove?
  fetchExplanationTexts(): string[] {
    // Check if explanationTexts is initialized and has entries
    if (!this.explanationTexts || Object.keys(this.explanationTexts).length === 0) {
      console.warn('Warning: explanationTexts is not initialized or is empty.');
      return [];
    }

    // Retrieve the current value of each BehaviorSubject
    return Object.values(this.explanationTexts).map(subject => {
      if (subject instanceof BehaviorSubject) {
        return subject.value;
      } else {
        console.error('Error: Encountered a non-BehaviorSubject entry in explanationTexts.');
        return 'Invalid explanation data';
      }
    });
  }

  formatExplanationText(question: QuizQuestion, questionIndex: number): Observable<{ questionIndex: number, explanation: string }> {
    // Early return for invalid or non-current question
    if (!this.isQuestionValid(question) || !this.isCurrentQuestion(question)) {
      console.log('Skipping question:', questionIndex, 'Reason:', !this.isQuestionValid(question) ? 'Invalid' : 'Not Current');
      return of({ questionIndex, explanation: '' });
    }

    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices);
    this.syncFormattedExplanationState(questionIndex, formattedExplanation);
    this.setFormattedExplanation(formattedExplanation);

    // Processing valid and current question
    const questionKey = JSON.stringify(question);
    this.processedQuestions.add(questionKey);

    return of({ questionIndex, explanation: formattedExplanation });
  }

  private formatExplanation(question: QuizQuestion, correctOptionIndices: number[]): string {
    if (correctOptionIndices.length > 1) {
      question.type = QuestionType.MultipleAnswer;
      
      // Join all but the last index with ', ', and the last one with ' and '
      let optionsText = correctOptionIndices.length > 2 
        ? `${correctOptionIndices.slice(0, -1).join(', ')} and ${correctOptionIndices.slice(-1)}` 
        : correctOptionIndices.join(' and ');
  
      return `Options ${optionsText} are correct because ${question.explanation}`;
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
    } else {
      console.error(`No element at index ${questionIndex} in formattedExplanations$`);
    }
  }

  private isQuestionValid(question: QuizQuestion): boolean {
    return question && question.questionText && !this.processedQuestions.has(question.questionText);
  }
  
  private getCorrectOptionIndices(question: QuizQuestion): number[] {
    return question.options
      .map((option, index) => option.correct ? index + 1 : null)
      .filter(index => index !== null);
  }

  setCurrentQuestionExplanation(explanation: string): void {
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

  resetExplanationState(): void {
    this.formattedExplanation$.next('');
    this.explanationTexts = {};
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
    this.nextExplanationTextSource.next('');
  }

  resetProcessedQuestionsState(): void {
    this.processedQuestions = new Set<string>();
  } 
}
