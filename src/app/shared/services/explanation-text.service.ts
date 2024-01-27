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
  explanationTexts: Record<number, string> = {};
  currentQuestionExplanation: string | null = null;
  formattedExplanations: Record<number, FormattedExplanation> = {};
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  formattedExplanations$: BehaviorSubject<string | null>[] = [];
  processedQuestions: Set<string> = new Set<string>();

  nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();
  
  private previousExplanationTextSource = new BehaviorSubject<string>('');
  previousExplanationText$: Observable<string> =
    this.previousExplanationTextSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ =
    this.shouldDisplayExplanationSource.asObservable();

  private isExplanationDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationDisplayed$ = this.isExplanationDisplayedSource.asObservable();

  private explanationDisplayedSource = new BehaviorSubject<boolean>(false);

  private destroyed$ = new Subject<void>();

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  setExplanationDisplayed(isDisplayed: boolean): void {
    this.explanationDisplayedSource.next(isDisplayed);
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  setExplanationText(explanation: string) {
    this.explanationText$.next(explanation);
    this.isExplanationDisplayedSource.next(true); // Set to true when explanation is displayed
  }
  
  resetExplanationText() {
    this.explanationText$.next('');
    this.isExplanationDisplayedSource.next(false); // Set to false when explanation is hidden
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    if (index < 0) {
      console.warn(`Invalid index: ${index}, must be greater than or equal to 0`);
      return;
    }
  
    this.explanationTexts[index] = explanation;
  }  

  getExplanationTextForQuestionIndex(index: number): string {
    const explanation = this.explanationTexts[index];
    if (explanation === undefined) {
      console.error(`No explanation found at index ${index}.`);
      return 'Explanation not found.';
    }

    return explanation;
  }

  initializeExplanationTexts(explanations: string[]): void {
    this.explanationTexts = {};

    explanations.forEach((explanation, index) => {
      this.explanationTexts[index] = explanation;
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

  private getCorrectOptionIndices(question: QuizQuestion): number[] {
    return question.options
      .map((option, index) => option.correct ? index + 1 : null)
      .filter(index => index !== null);
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
