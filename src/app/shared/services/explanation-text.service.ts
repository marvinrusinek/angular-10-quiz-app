import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>('');
  explanations: string[] = [];
  explanationTexts: { [questionIndex: number]: string } = {};
  prefixes: { [key: number]: string } = {};
  questionIndexCounter = 0;

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private previousExplanationTextSource = new BehaviorSubject<string>('');
  previousExplanationText$: Observable<string> = this.previousExplanationTextSource.asObservable();

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
    console.log(`Setting explanation text for index ${index}: ${explanation}`);
    this.explanationTexts[index] = explanation;
  }

  getExplanationTextForQuestionIndex(index: number): string | undefined {
    const keys = Object.keys(this.explanationTexts);
    if (index >= 0 && index < keys.length) {
      return this.explanationTexts[index] || '';
    }
    return '';
  }

  // Method to return combined observable for explanation and prefix
  getExplanationWithPrefixForQuestionIndex(index: number): Observable<{ explanation: string, prefix: string | undefined }> {
    const explanation$ = this.getExplanationText$();
    const prefix$ = this.getExplanationPrefixForQuestionIndex(index);

    return combineLatest([explanation$, prefix$]).pipe(
      map(([explanation, prefix]) => ({ explanation, prefix }))
    );
  }

  getExplanationPrefixForQuestionIndex(index: number): string | undefined {
    // Retrieve the prefix for a given index from the prefixes array
    if (index >= 0 && index < this.prefixes.length) {
      return this.prefixes[index];
    }
    return undefined; // Return undefined for invalid indices
  }
  
  /* formatExplanationText(selectedOptions: Option[], question: QuizQuestion, nextQuestion: QuizQuestion | null): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }

      const currentExplanationParts = [];
      const nextExplanationParts = [];

      // Check if there are selected correct options for the current question
      const correctOptions = question.options.filter(option => option.correct);
      const selectedCorrectOptions = selectedOptions.filter(option => option.correct);

      if (selectedCorrectOptions.length > 1) {
        const correctOptionIndices = selectedCorrectOptions.map(option => question.options.indexOf(option) + 1);
        const correctOptionsString = correctOptionIndices.join(' and ');
        currentExplanationParts.push(`Options ${correctOptionsString} are correct because`);
      } else if (selectedCorrectOptions.length === 1) {
        const correctOptionIndex = question.options.indexOf(selectedCorrectOptions[0]) + 1;
        currentExplanationParts.push(`Option ${correctOptionIndex} is correct because`);
      }

      // Check if there is a next question
      if (nextQuestion) {
        const nextCorrectOptions = nextQuestion.options.filter(option => option.correct);
        if (nextCorrectOptions.length > 1) {
          const nextCorrectOptionIndices = nextCorrectOptions.map(option => nextQuestion.options.indexOf(option) + 1);
          const nextCorrectOptionsString = nextCorrectOptionIndices.join(' and ');
          nextExplanationParts.push(`Options ${nextCorrectOptionsString} are correct because`);
        } else if (nextCorrectOptions.length === 1) {
          const nextCorrectOptionIndex = nextQuestion.options.indexOf(nextCorrectOptions[0]) + 1;
          nextExplanationParts.push(`Option ${nextCorrectOptionIndex} is correct because`);
        }
      }

      // Combine the current and next explanation parts
      const combinedExplanationParts = [...currentExplanationParts, ...nextExplanationParts];
      const combinedExplanationText = combinedExplanationParts.join(' ');

      // Call the method to update explanation texts for the current and next questions
      this.updateExplanationTextForCurrentAndNext(combinedExplanationText, '');

      console.log('Return value before piping:', combinedExplanationText);

      return of(combinedExplanationText).pipe(
        tap(text => {
          console.log('Generated Explanation Text:', text);
        })
      );
    } catch (error) {
      console.error('Error occurred while formatting explanation text:', error);
      return of('');
    }
  } */

  formatExplanationText(
    options: Option[],
    question: QuizQuestion,
    nextQuestion: QuizQuestion | null
  ): Observable<{ explanation: string, prefix: string }> {
    return new Observable((observer) => {
      const correctOptions = options.filter((option) => option.correct);
      const correctOptionIndices = correctOptions.map((option) => question.options.indexOf(option) + 1);

      let formattedExplanation = '';
      let prefix = '';

      const isMultipleAnswer = correctOptionIndices.length > 1;

      if (isMultipleAnswer) {
        const correctOptionsString = correctOptionIndices.join(' and ');
        prefix = `Options ${correctOptionsString} are correct because`;
      } else if (correctOptionIndices.length === 1) {
        prefix = `Option ${correctOptionIndices[0]} is correct because`;
      } else {
        prefix = 'No correct option selected...';
      }

      console.log('Generated Prefix:', prefix);
      console.log('Question Explanation:', question.explanation); // Ensure question.explanation exists and contains the necessary context.

      // Construct the formatted explanation by combining the prefix and the question's explanation.
      formattedExplanation = `${prefix} ${question.explanation}`;

      console.log('Generated Explanation:', formattedExplanation);

      this.prefixes[this.questionIndexCounter] = prefix;
      this.explanationTexts[this.questionIndexCounter] = formattedExplanation;

      this.questionIndexCounter++;

      observer.next({ explanation: formattedExplanation, prefix: prefix });
      observer.complete();
    });
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
    this.explanationTexts = [];
    this.explanationText$ = new BehaviorSubject<string | null>(null);
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}
