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

  /* setExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    currentQuestionIndex?: number
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
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
  
          // Store the explanation text for the current question
          this.setExplanationForQuestionIndex(
            currentQuestionIndex,
            this.explText
          );
          // Retrieve the explanation text for the current question
          const currentExplanation = this.getExplanationForQuestionIndex(
            currentQuestionIndex
          );
  
          console.log("Current Explanation:", currentExplanation);
  
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
  
          // Store the explanation text for the current question
          this.setExplanationForQuestionIndex(
            currentQuestionIndex,
            this.explText
          );
          // Retrieve the explanation text for the current question
          const currentExplanation = this.getExplanationForQuestionIndex(
            currentQuestionIndex
          );
  
          console.log("Current Explanation:", currentExplanation);
  
          console.log("SETEXPLTEXT", this.explText);
        } else {
          if (question && question.explanation) {
            this.explText = `Options ${optionIndicesString} are correct because ${question.explanation}`;
            this.explanationText$.next(this.explText);
            this.setNextExplanationText(this.explText);
  
            // Store the explanation text for the current question
            this.setExplanationForQuestionIndex(
              currentQuestionIndex,
              this.explText
            );
            // Retrieve the explanation text for the current question
            const currentExplanation = this.getExplanationForQuestionIndex(
              currentQuestionIndex
            );
  
            console.log("Current Explanation:", currentExplanation);
  
            console.log("SETEXPLTEXT", this.explText);
          } else {
            this.explText = '';
          }
        }
      }
      return this.explanationText$;
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return this.explanationText$;
    }
  } */

  /* setExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    currentQuestionIndex?: number
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
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
  
          // Store the explanation text for the current question
          this.setExplanationForQuestionIndex(
            currentQuestionIndex,
            this.explText
          );
  
          // Retrieve the explanation text for the current question
          const currentExplanation = this.getExplanationForQuestionIndex(
            currentQuestionIndex
          );
  
          console.log("Current Explanation:", currentExplanation);
  
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
  
          // Store the explanation text for the current question
          this.setExplanationForQuestionIndex(
            currentQuestionIndex,
            this.explText
          );
  
          // Retrieve the explanation text for the current question
          const currentExplanation = this.getExplanationForQuestionIndex(
            currentQuestionIndex
          );
  
          console.log("Current Explanation:", currentExplanation);
  
          console.log("SETEXPLTEXT", this.explText);
        } else {
          if (question && question.explanation) {
            this.explText = `Options ${optionIndicesString} are correct because ${question.explanation}`;
            this.explanationText$.next(this.explText);
            this.setNextExplanationText(this.explText);
  
            // Store the explanation text for the current question
            this.setExplanationForQuestionIndex(
              currentQuestionIndex,
              this.explText
            );
  
            // Retrieve the explanation text for the current question
            const currentExplanation = this.getExplanationForQuestionIndex(
              currentQuestionIndex
            );
  
            console.log("Current Explanation:", currentExplanation);
  
            console.log("SETEXPLTEXT", this.explText);
          } else {
            this.explText = '';
          }
        }
      }
      // return this.explanationText$;
      return of(this.explText);
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return of(this.explText);
    }
  } */

  /* setExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    currentQuestionIndex?: number
  ): Observable<string> {
    try {
      // Determine if there are correct options
      const correctOptions = question?.options?.filter(option => option?.correct) || [];
      const selectedCorrectOptions = selectedOptions.filter(option => option?.correct === true);
  
      // Create the explanation text
      let explanationText = '';
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          explanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          explanationText = `Options ${correctOptionsString}`;
        }
  
        explanationText += ' are correct because ';
      }
  
      if (question && question.explanation) {
        explanationText += question.explanation;
      }
  
      // Store the explanation text for the current question
      this.setExplanationForQuestionIndex(currentQuestionIndex, explanationText);
  
      // Retrieve the explanation text for the current question
      const currentExplanation = this.getExplanationForQuestionIndex(currentQuestionIndex);
  
      console.log('Current Explanation:', currentExplanation);
  
      this.explanationText$.next(explanationText);
  
      return of(explanationText);
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return of('');
    }
  } */

  setExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      const correctOptions = question?.options?.filter(option => option?.correct) || [];
      const selectedCorrectOptions = selectedOptions.filter(option => option?.correct === true);
  
      let explanationText = '';
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          explanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          explanationText = `Options ${correctOptionsString}`;
        }
  
        explanationText += ' are correct because ';
      }
  
      if (question && question.explanation) {
        explanationText += question.explanation;
      }
  
      this.explanationText$.next(explanationText);
  
      return of(explanationText);
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return of('');
    }
  }
                
  updateExplanationText(explanationText: string) {
    try {
      this.nextExplanationTextSource.next(explanationText);
      console.log('Updated explanation text:', explanationText);
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
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