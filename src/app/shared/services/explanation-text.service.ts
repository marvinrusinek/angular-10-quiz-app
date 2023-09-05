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

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

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
  
      const correctOptions = question?.options?.filter(option => option?.correct) || [];
      
      let explanationText = '';
  
      if (correctOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          explanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          explanationText = `Options ${correctOptionsString}`;
        }
  
        explanationText += correctOptionIndices.length === 1 ? ' is' : ' are';
        explanationText += ' correct because ';
      }
  
      if (question && question.explanation) {
        explanationText += question.explanation;
      }
  
      // Store the explanation text for the current question
      this.setExplanationForQuestionIndex(currentQuestionIndex, explanationText);
  
      // Retrieve the explanation text for the current question
      const currentExplanation = this.getExplanationForQuestionIndex(currentQuestionIndex);
  
      // Notify observers about the updated explanation text
      this.updateExplanationText(explanationText);
  
      return of(explanationText);
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.updateExplanationText('');
      return of('');
    }
  } */

  /* formatExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    nextQuestion: QuizQuestion | null
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      let currentExplanationText = '';
      let nextExplanationText = '';
  
      // Check if there are selected correct options
      const correctOptions = question.options.filter(option => option.correct);
      const selectedCorrectOptions = selectedOptions.filter(option => option.correct);
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          currentExplanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          currentExplanationText = `Options ${correctOptionsString}`;
        }
  
        currentExplanationText += correctOptionIndices.length === 1
          ? ' is correct because'
          : ' are correct because';
      }
  
      if (question.explanation) {
        currentExplanationText += ` ${question.explanation}`;
      }
  
      // Check if there is a next question and calculate its explanation text
      if (nextQuestion) {
        // Calculate the next explanation text based on your application's logic
        // You can use a similar approach as above to determine nextExplanationText
        nextExplanationText = ''; // Calculate the next explanation text here
      }
  
      // Call the method to update explanation texts for the current and next questions
      this.updateExplanationTextForCurrentAndNext(currentExplanationText, nextExplanationText);
  
      // Return the formatted explanation
      return of(currentExplanationText);
    } catch (error) {
      console.error('Error occurred while formatting explanation text:', error);
      return of('');
    }
  } */

  /* formatExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    nextQuestion: QuizQuestion | null
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      let currentExplanationText = '';
      let nextExplanationText = '';
  
      // Check if there are selected correct options for the current question
      const correctOptions = question.options.filter(option => option.correct);
      const selectedCorrectOptions = selectedOptions.filter(option => option.correct);
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          currentExplanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          currentExplanationText = `Options ${correctOptionsString}`;
        }
  
        currentExplanationText += correctOptionIndices.length === 1
          ? ' is correct because'
          : ' are correct because';
      }
  
      if (question.explanation) {
        currentExplanationText += ` ${question.explanation}`;
      }
  
      // Check if there is a next question and calculate its explanation text
      if (nextQuestion) {
        // Check if there are correct options for the next question
        const nextCorrectOptions = nextQuestion.options.filter(option => option.correct);
  
        if (nextCorrectOptions.length > 0) {
          const nextCorrectOptionIndices = nextCorrectOptions.map(option => nextQuestion.options.indexOf(option) + 1);
  
          if (nextCorrectOptionIndices.length === 1) {
            nextExplanationText = `Option ${nextCorrectOptionIndices[0]}`;
          } else {
            const nextCorrectOptionsString = nextCorrectOptionIndices.join(' and ');
            nextExplanationText = `Options ${nextCorrectOptionsString}`;
          }
  
          nextExplanationText += nextCorrectOptionIndices.length === 1
            ? ' is correct because'
            : ' are correct because';
        }
  
        if (nextQuestion.explanation) {
          nextExplanationText += ` ${nextQuestion.explanation}`;
        }
      }
  
      // Call the method to update explanation texts for the current and next questions
      this.updateExplanationTextForCurrentAndNext(currentExplanationText, nextExplanationText);
  
      // Return the formatted explanation
      return of(currentExplanationText);
    } catch (error) {
      console.error('Error occurred while formatting explanation text:', error);
      return of('');
    }
  } */

  formatExplanationText(
    selectedOptions: Option[],
    question: QuizQuestion,
    nextQuestion: QuizQuestion | null
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      let currentExplanationText = '';
      let nextExplanationText = '';
      let combinedExplanationText = '';
  
      // Check if there are selected correct options for the current question
      const correctOptions = question.options.filter(option => option.correct);
      const selectedCorrectOptions = selectedOptions.filter(option => option.correct);
  
      if (selectedCorrectOptions.length > 0) {
        const correctOptionIndices = correctOptions.map(option => question.options.indexOf(option) + 1);
  
        if (correctOptionIndices.length === 1) {
          currentExplanationText = `Option ${correctOptionIndices[0]}`;
        } else {
          const correctOptionsString = correctOptionIndices.join(' and ');
          currentExplanationText = `Options ${correctOptionsString}`;
        }
  
        currentExplanationText += correctOptionIndices.length === 1
          ? ' is correct because'
          : ' are correct because';
      }
  
      if (question.explanation) {
        currentExplanationText += ` ${question.explanation}`;
      }
  
      // Check if there is a next question
      if (nextQuestion) {
        const nextCorrectOptions = nextQuestion.options.filter(option => option.correct);
  
        if (nextCorrectOptions.length > 0) {
          const nextCorrectOptionIndices = nextCorrectOptions.map(option => nextQuestion.options.indexOf(option) + 1);
  
          if (nextCorrectOptionIndices.length === 1) {
            nextExplanationText = `Option ${nextCorrectOptionIndices[0]}`;
          } else {
            const nextCorrectOptionsString = nextCorrectOptionIndices.join(' and ');
            nextExplanationText = `Options ${nextCorrectOptionsString}`;
          }
  
          nextExplanationText += nextCorrectOptionIndices.length === 1
            ? ' is correct because'
            : ' are correct because';
        }
  
        if (nextQuestion.explanation) {
          nextExplanationText += ` ${nextQuestion.explanation}`;
        }
      }
  
      // Combine the current and next explanation texts
      if (currentExplanationText && nextExplanationText) {
        combinedExplanationText = `${currentExplanationText} and ${nextExplanationText}`;
      } else if (currentExplanationText) {
        combinedExplanationText = currentExplanationText;
      } else if (nextExplanationText) {
        combinedExplanationText = nextExplanationText;
      }
  
      // Call the method to update explanation texts for the current and next questions
      this.updateExplanationTextForCurrentAndNext(combinedExplanationText, '');
  
      // Return the formatted explanation
      return of(combinedExplanationText);
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