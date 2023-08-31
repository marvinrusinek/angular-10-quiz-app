import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  explText: string = '';
  explanations: string[] = [];
  private explanationTexts: { [questionIndex: number]: string } = {};

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSource.asObservable();

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

  setExplanationForQuestionIndex(index: number, explanation: string): void {
    this.explanations[index] = explanation;
  }

  getExplanationForQuestionIndex(index: number): string {
    const explanationArray = this.explanations;
  
    if (index >= 0 && index < explanationArray.length) {
      return explanationArray[index] || '';
    }
  
    return '';
  }

  setExplanationTextForIndex(index: number, explanation: string): void {
    this.explanationTexts[index] = explanation;
}

  getExplanationTextForIndex(index: number): string | undefined {
      return this.explanationTexts[index];
  }

  setExplanationText(
    selectedOptions: Option[],
    question?: QuizQuestion
  ): Observable<string> {
    console.log('selectedOptions:', selectedOptions);
    console.log('Array.isArray(selectedOptions):', Array.isArray(selectedOptions));
    console.log('setExplanationText received selectedOptions:', selectedOptions);
    console.log('setExplanationText received Array.isArray(selectedOptions):', Array.isArray(selectedOptions));
    console.log('setExplanationText received options:', selectedOptions);

    

    if (!Array.isArray(selectedOptions)) {
      console.error('Error: selectedOptions is not an array');
      return of('');
    }

    // Update the last displayed explanation text
    this.lastDisplayedExplanationText = this.explanationText$.value;

    if (question && question.explanation) {
      this.nextExplanationTextSource.next(question.explanation);
      this.explText = question.explanation;
    } else {
      this.nextExplanationTextSource.next('');
      this.explText = '';
    }

    // Set the isExplanationTextDisplayed flag
    this.isExplanationTextDisplayedSource.next(true);

    // console.log('Explanation Text Service - Explanation Text:', this.explanationText$.value);
    // console.log('Explanation Text Service - Should Display Explanation:', this.shouldDisplayExplanationSource.value);

    try {
      const correctOptions = question?.options?.filter(option => option?.correct) || [];

      const selectedCorrectOptions = selectedOptions.filter(
        (option) => option?.correct === true
      );

      const shouldDisplayExplanation =
        selectedCorrectOptions.length > 0 &&
        selectedCorrectOptions.length !== correctOptions.length;

      this.isExplanationTextDisplayedSource.next(shouldDisplayExplanation);

      if (selectedOptions.length === 0) {
        this.explanationText$.next('');
      } else if (correctOptions.length === selectedCorrectOptions.length) {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );

        if (correctOptions.length === 1) {
          this.explText = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
          this.explanationText$.next(this.explText);
          console.log("SETEXPLTEXT", this.explText);
        } else if (correctOptions.length > 1) {
          const correctOptionsString = correctOptionIndices.join(' and ');
          this.explText = `Options ${correctOptionsString} are correct because ${question.explanation}`;
          this.explanationText$.next(this.explText);
          this.setNextExplanationText(this.explText);
          console.log("SETEXPLTEXT", this.explText);
        }
      } else {
        const correctOptionIndices = correctOptions.map(
            (option) => question.options.indexOf(option) + 1
        );
        const optionIndicesString = correctOptionIndices.join(' and ');

        if (correctOptions.length === 1) {
          this.explText = `Option ${optionIndicesString} is correct because ${question.explanation}`;
          this.explanationText$.next(this.explText);
          this.setNextExplanationText(this.explText);
          console.log("SETEXPLTEXT", this.explText);
        } else {
          if (question && question.explanation) {
            this.explText = `Options ${optionIndicesString} are correct because ${question.explanation}`;
            this.explanationText$.next(this.explText);
            this.setNextExplanationText(this.explText);
            console.log("SETEXPLTEXT", this.explText);
          }
        }
      }
      return this.explanationText$;
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return this.explanationText$;
    }
  }

  setNextExplanationText(explanationText: string) {
    this.nextExplanationTextSource.next(explanationText);
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
  }

  resetExplanationState() {
    console.log('resetExplanationState() called');
    this.explanations = [];
    this.explanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}