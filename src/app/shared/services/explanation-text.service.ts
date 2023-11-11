import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of, timer } from 'rxjs';
import { map, take, tap } from 'rxjs/operators';

import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';


@Injectable({
  providedIn: 'root'
})
export class ExplanationTextService {
  currentQuestionIndex: number = 0;
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanations: string[] = [];
  explanationTexts: { [questionIndex: number]: string } = {};
  processedQuestions: Set<string> = new Set<string>();

  /* private formattedExplanationSource = new BehaviorSubject<string>('');
  formattedExplanation$ = this.formattedExplanationSource.asObservable(); */
  
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  formattedExplanations: FormattedExplanation[] = [];
  questionIndexCounter = 0;

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>(null);
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

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    this.explanationTexts[index] = explanation;
  }

  getExplanationTextForQuestionIndex(index: number): string | undefined {
    return this.explanationTexts[index];
  }

  // Function to update explanations based on question ID or index
  updateExplanationForQuestion(questionId: string | number, explanation: string): void {
    this.explanationTexts[questionId] = explanation;
  }

  // Retrieve explanation for a specific question
  getExplanationForQuestion(questionId: string | number): string | undefined {
    return this.explanationTexts[questionId];
  }

  getFormattedExplanation$() {
    return this.formattedExplanation$.asObservable();
  }

  updateFormattedExplanation(newValue: string) {
    this.formattedExplanation$.next(newValue);
  }

  resetProcessedQuestionsState(): void {
    this.processedQuestions = new Set<string>();
  }
  
  formatExplanationText(question: QuizQuestion): { explanation: string } {
    this.resetProcessedQuestionsState();
  
    if (this.processedQuestions.has(question.questionText)) {
      console.log('Skipping already processed question with text:', question.questionText);
      return { explanation: '' }; // or some default value
    }
  
    this.processedQuestions.add(question.questionText);
    console.log('Processing question with text:', question.questionText);
  
    let correctOptionIndices: number[] = [];
  
    for (let i = 0; i < question.options.length; i++) {
      if (question.options[i].correct) {
        correctOptionIndices.push(i + 1);
      }
    }
  
    const isMultipleAnswer = correctOptionIndices.length > 1;
    const multipleAnswerText = 'are correct because';
    const singleAnswerText = 'is correct because';
  
    let optionQualifier = isMultipleAnswer ? multipleAnswerText : singleAnswerText;
  
    console.log('Before setting explanation, currentQuestionIndex:', this.currentQuestionIndex);
  
    const formattedExplanation = {
      questionIndex: this.currentQuestionIndex,
      explanation: `${this.formatOptions(correctOptionIndices)} ${optionQualifier} ${question.explanation}`,
    };
  
    // Set the formatted explanation for the question
    this.formattedExplanation$.next(formattedExplanation.explanation);
    this.explanationTexts[this.currentQuestionIndex] = formattedExplanation.explanation;
  
    console.log('After setting explanation, currentQuestionIndex:', this.currentQuestionIndex);
  
    correctOptionIndices = [];
  
    return { explanation: formattedExplanation.explanation };
  }
          
  private formatOptions(optionIndices: number[]): string {
    if (optionIndices.length > 1) {
      return `Options ${optionIndices.join(' and ')}`;
    } else if (optionIndices.length === 1) {
      return `Option ${optionIndices[0]}`;
    } else {
      return 'No correct option selected...';
    }
  }
  
  // Function to set or update the formatted explanation for a question
  setFormattedExplanationForQuestion(questionIndex: number, explanation: string): void {
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
  getFormattedExplanationForQuestion(questionIndex: number): string | undefined {
    const explanationObj = this.formattedExplanations.find(
      (exp) => exp.questionIndex === questionIndex
    );

    return explanationObj ? explanationObj.explanation : undefined;
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
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  getLastDisplayedExplanationText(): string {
    return this.lastDisplayedExplanationText;
  }

  clearExplanationText(): void {
    console.log('clearExplanationText() called');
    this.explanationText$.next('');
    this.nextExplanationTextSource.next('');
  }

  resetExplanationState(): void {
    console.log('resetExplanationState() called');
    this.formattedExplanation$.next('');
    this.explanationTexts = [];
    this.explanationText$.next(null);
    this.nextExplanationText$.next(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }   
}
