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
    question: QuizQuestion,
    currentQuestionIndex?: number
  ): Observable<string> {
    try {
      if (!Array.isArray(selectedOptions)) {
        throw new Error('selectedOptions is not an array');
      }
  
      const correctOptions = question?.options?.filter(option => option?.correct) || [];
      const selectedCorrectOptions = selectedOptions.filter(option => option?.correct === true);

      console.log('selectedOptions:', selectedOptions);
      console.log('correctOptions:', correctOptions);
      console.log('selectedCorrectOptions:', selectedCorrectOptions);
  
      let explanationText = '';
  
      if (selectedCorrectOptions.length > 0) {
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