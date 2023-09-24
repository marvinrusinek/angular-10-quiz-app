import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  // explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  
  explText: string = '';
  explanations: string[] = [];
  explanationTexts: { [questionIndex: number]: string } = {};

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSource.asObservable();

  private shouldDisplayExplanationSubject = new BehaviorSubject<boolean>(false);

  lastDisplayedExplanationText: string = '';

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);
  }

  get explanationText(): Observable<string> {
    return this.explanationText$.asObservable();
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  getExplanationForQuestionIndex(index: number): string {
    if (index >= 0 && index < this.explanations.length) {
      return this.explanations[index] || '';
    }
    return '';
  }

  setExplanationTextForIndex(index: number, explanation: string): void {
    console.log(`Setting explanation text for index ${index}: ${explanation}`);
    this.explanationTexts[index] = explanation;
  }

  getExplanationTextForIndex(index: number): string | undefined {
    return this.explanationTexts[index] || '';
  }

  formatExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    nextQuestion: QuizQuestion | null
  ): Observable<string> {
    console.log("FET TEST");
    console.log('formatExplanationText called with:', selectedOptions, question, nextQuestion);
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      const currentExplanationParts = [];
      const nextExplanationParts = [];
  
      // Check if there are selected correct options for the current question
      const correctOptions = question.options.filter(option => option.correct);
      const selectedCorrectOptions = selectedOptions.filter(option => option.correct);
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          currentExplanationParts.push(`Option ${correctOptionIndices[0]}`);
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          currentExplanationParts.push(`Options ${correctOptionsString}`);
        }
  
        currentExplanationParts.push(correctOptionIndices.length === 1
          ? 'is correct because'
          : 'are correct because');
      }
  
      // Check if there is a next question
      if (nextQuestion) {
        const nextCorrectOptions = nextQuestion.options.filter(option => option.correct);
  
        if (nextCorrectOptions.length > 0) {
          const nextCorrectOptionIndices = nextCorrectOptions.map(option => nextQuestion.options.indexOf(option) + 1);
  
          if (nextCorrectOptionIndices.length === 1) {
            nextExplanationParts.push(`Option ${nextCorrectOptionIndices[0]}`);
          } else {
            const nextCorrectOptionsString = nextCorrectOptionIndices.join(' and ');
            nextExplanationParts.push(`Options ${nextCorrectOptionsString}`);
          }
  
          nextExplanationParts.push(nextCorrectOptionIndices.length === 1
            ? 'is correct because'
            : 'are correct because');
        }
      }
  
      // Combine the current and next explanation parts
      const combinedExplanationParts = [...currentExplanationParts, ...nextExplanationParts];
  
      // Join the parts into a single explanation text
      const combinedExplanationText = combinedExplanationParts.join(' ');
  
      // Call the method to update explanation texts for the current and next questions
      this.updateExplanationTextForCurrentAndNext(combinedExplanationText, '');

      console.log('Return value before piping:', combinedExplanationText);
  
      // Return the formatted explanation
      // return of(combinedExplanationText);
      return of(combinedExplanationText).pipe(
        tap((text) => {
          console.log('Generated Explanation Text:', text);
        })
      );
    } catch (error) {
      console.error('Error occurred while formatting explanation text:', error);
      return of('');
    }
  }
    
  updateExplanationTextForCurrentAndNext(currentExplanationText: string, nextExplanationText: string) {
    try {
      this.currentExplanationTextSource.next(currentExplanationText);
      this.nextExplanationTextSource.next(nextExplanationText);
      console.log('Updated explanation text for current question:', currentExplanationText);
      console.log('Updated explanation text for next question:', nextExplanationText);
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
  }

  toggleExplanationDisplay(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  setNextExplanationText(explanationText: string) {
    try {
      console.log('Setting next explanation text:', explanationText);
      this.nextExplanationTextSource.next(explanationText);
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
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

  resetExplanationState() {
    console.log('resetExplanationState() called');
    this.explanations = [];
    this.explanationText$ = new BehaviorSubject<string | null>(null);
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}