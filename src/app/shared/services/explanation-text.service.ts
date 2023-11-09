import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';


@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanations: string[] = [];
  explanationTexts: { [questionIndex: number]: string } = {};
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

  formatExplanationText(question: QuizQuestion): { explanation: string } {
    let correctOptionIndices: number[] = [];
  
    for (let i = 0; i < question.options.length; i++) {
      if (question.options[i].correct) {
        correctOptionIndices.push(i + 1);
      }
    }
  
    let formattedExplanation = '';
    let optionQualifier = '';
  
    const isMultipleAnswer = correctOptionIndices.length > 1;
    const multipleAnswerText = 'are correct because';
    const singleAnswerText = 'is correct because';
  
    if (isMultipleAnswer) {
      formattedExplanation = `Options ${correctOptionIndices.join(' and ')} ${multipleAnswerText} ${question.explanation}`;
      optionQualifier = multipleAnswerText;
    } else if (correctOptionIndices.length === 1) {
      formattedExplanation = `Option ${correctOptionIndices[0]} ${singleAnswerText} ${question.explanation}`;
      optionQualifier = singleAnswerText;
    } else {
      formattedExplanation = 'No correct option selected...';
    }
  
    // Set the formatted explanation for the question
    this.formattedExplanation$.next(formattedExplanation);
    this.explanationTexts[this.questionIndexCounter] = formattedExplanation;
    this.questionIndexCounter++;

    correctOptionIndices = [];
  
    return { explanation: formattedExplanation };
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

  clearExplanationText(): void {
    console.log('clearExplanationText() called');
    this.explanationText$.next('');
    this.nextExplanationTextSource.next('');
  }

  resetExplanationState() {
    console.log('resetExplanationState() called');
    this.formattedExplanation$ = new BehaviorSubject<string>('');
    this.explanationTexts = [];
    this.explanationText$ = new BehaviorSubject<string | null>(null);
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}
