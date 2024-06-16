import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { QuestionType } from '../../shared/models/question-type.enum';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = 
    new BehaviorSubject<string | null>('');
  explanationTexts: Record<number, string> = {};

  currentQuestionExplanation: string | null = null;
  
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  processedQuestions: Set<string> = new Set<string>();

  private explanationsUpdated = new BehaviorSubject<Record<number, FormattedExplanation>>(this.formattedExplanations);
  explanationsUpdated$ = this.explanationsUpdated.asObservable();

  private explanationSource = new BehaviorSubject<string>('');
  explanation$ = this.explanationSource.asObservable();

  nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$ = this.isExplanationTextDisplayedSource.asObservable();

  shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSource.asObservable();

  private isExplanationDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationDisplayed$ = this.isExplanationDisplayedSource.asObservable();

  constructor() {}

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
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

  getFormattedExplanationTextForQuestion(index: number): string {
    console.log('Formatted explanations:', this.formattedExplanations);
    // Check if the index is a valid key in the formattedExplanations object.
    if (index in this.formattedExplanations) {
      // Retrieve the formatted explanation using the index.
      const formattedExplanation = this.formattedExplanations[index];
      console.log("Formatted Explanation:", formattedExplanation);
      // Return the explanation text if available, or a default message if it's not.
      return formattedExplanation && formattedExplanation.explanation
        ? formattedExplanation.explanation : 'No explanation available';
    } else {
      console.log(`Index ${index} is out of bounds.`);
      return 'Question index out of bounds or no explanation available';
    }
  }

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = {};

    explanations.forEach((explanation, index) => {
      this.explanationTexts[index] = explanation;
    });
  }

  initializeFormattedExplanations(explanations: { questionIndex: number; explanation: string }[]): void {
    this.formattedExplanations = {}; // Clear existing data

    if (!Array.isArray(explanations) || explanations.length === 0) {
      console.warn('No explanations provided for initialization.');
      return;
    }

    explanations.forEach(({ questionIndex, explanation }) => {
      console.log(`Processing explanation for questionIndex ${questionIndex}:`, explanation);

      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        console.warn(`Invalid questionIndex: ${questionIndex}. It should be a non-negative number.`);
        return;
      }

      if (typeof explanation !== 'string' || !explanation.trim()) {
        console.warn(`Invalid or empty explanation for questionIndex ${questionIndex}:`, explanation);
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: 'No explanation available' };
      } else {
        this.formattedExplanations[questionIndex] = { questionIndex, explanation: explanation.trim() };
        console.log("Formatted Explanation", this.formattedExplanations[questionIndex]);
      }
    });

    // Notify subscribers about the updated explanations
    this.explanationsUpdated.next(this.formattedExplanations);
    console.log('Formatted explanations initialized:', this.formattedExplanations);
    console.log('Explanations updated notification sent.');
  }

  formatExplanationText(question: QuizQuestion, questionIndex: number): 
    Observable<{ questionIndex: number, explanation: string }> {
    // Early return for invalid or non-current question
    if (!this.isQuestionValid(question) || !this.isCurrentQuestion(question)) {
      /* console.log('Skipping question:', questionIndex, 
        'Reason:', !this.isQuestionValid(question) ? 'Invalid' : 'Not Current'); */
      return of({ questionIndex, explanation: '' });
    }

    const correctOptionIndices = this.getCorrectOptionIndices(question);
    const formattedExplanation = this.formatExplanation(question, correctOptionIndices);

    // Log formatted explanation
    console.log('Formatted explanation for question index:', questionIndex, ':', formattedExplanation);
    
    // Store the formatted explanation
    this.storeFormattedExplanation(questionIndex, formattedExplanation, question);

    this.syncFormattedExplanationState(questionIndex, formattedExplanation);
    this.setFormattedExplanation(formattedExplanation);

    // Processing valid and current question
    const questionKey = JSON.stringify(question);
    this.processedQuestions.add(questionKey);

    return of({ questionIndex, explanation: formattedExplanation });
  }

  // Method to sanitize explanation text
  private sanitizeExplanation(explanation: string): string {
    // Example sanitization logic, add more as needed
    return explanation.trim();
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

    // Ensure explanation is sanitized and properly handled
    const sanitizedExplanation = this.sanitizeExplanation(explanation);

    // Properly handle the formatted explanation, associating it with the question
    const formattedExplanation: FormattedExplanation = {
        questionIndex: index,
        explanation: this.formatExplanation(question, sanitizedExplanation)
    };

    this.formattedExplanations[index] = formattedExplanation;

    // Update the observable with the new explanations
    this.explanationsUpdated.next(this.formattedExplanations);

    console.log(`Explanations updated notification sent for index ${index}: ${this.formattedExplanations[index].explanation}`);
  }

  private getCorrectOptionIndices(question: QuizQuestion): number[] {
    if (!question || !Array.isArray(question.options)) {
      console.error("Invalid question or options:", question);
      return [];
    }

    return question.options
      .map((option, index) => option.correct ? index + 1 : null)
      .filter((index): index is number => index !== null);
  }

  /* private formatExplanation(
    question: QuizQuestion, correctOptionIndices: number[]): string {
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
  } */

  formatExplanation(question: QuizQuestion, explanation: string): string {
    const correctOptionIndices = this.getCorrectOptionIndices(question);
    let formattedExplanation = explanation;

    if (correctOptionIndices.length > 1) {
      question.type = QuestionType.MultipleAnswer;
      formattedExplanation = `Options ${correctOptionIndices.join(', ')} are correct because ${explanation}`;
    } else if (correctOptionIndices.length === 1) {
      question.type = QuestionType.SingleAnswer;
      formattedExplanation = `Option ${correctOptionIndices[0]} is correct because ${explanation}`;
    } else {
      formattedExplanation = 'No correct options available.';
    }

    return formattedExplanation;
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
    
  setFormattedExplanation(newExplanation: string): void {
    this.formattedExplanation$.next(newExplanation);
  }

  /* getFormattedExplanation(questionIndex: number): Observable<string> {
    console.log('Fetching explanation for questionIndex:', questionIndex);
    const explanation = this.formattedExplanations[questionIndex];
    if (explanation && explanation.explanation) {
      console.log('Fetched Explanation:', explanation.explanation);
      return of(explanation.explanation);
    } else if (!explanation) {
      console.warn('No explanation object found for questionIndex:', questionIndex);
    } else {
      console.warn('Explanation object found but empty for questionIndex:', questionIndex, 'Explanation:', explanation);
    }
    return of('No explanation available.');
  }  */

  getFormattedExplanation(questionIndex: number): Observable<string> {
    console.log('Fetching explanation for questionIndex:', questionIndex);
    const explanationText = this.getFormattedExplanationTextForQuestion(questionIndex);
    console.log("Formatted Explanation::::::", explanationText);
    return of(explanationText);
  }

  getFormattedExplanations(): FormattedExplanation[] {
    const formattedExplanations = Object.values(this.formattedExplanations).map(explanationObj => {
      if (typeof explanationObj.explanation !== 'string') {
        console.warn(`Invalid explanation format for questionIndex ${explanationObj.questionIndex}:`, explanationObj.explanation);
        explanationObj.explanation = ''; // Fallback to empty string if explanation is invalid
      }
      return explanationObj;
    });
    console.log('Formatted Explanations in Service:', formattedExplanations);
    return formattedExplanations;
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

  setIsExplanationTextDisplayed(isDisplayed: boolean): void {
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
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
