import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root'
})
export class QuizQuestionManagerService {
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  explanationText: string;
  numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers = false;
  isOptionSelected = false;
  shouldDisplayExplanation = false;
  correctAnswersCount = 0; // not currently being used
  selectedOption: Option | null = null;

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  setSelectedOption(option: Option): void {
    this.selectedOption = option;
  }

  updateCurrentQuestionDetail(question: QuizQuestion): void {
    this.currentQuestion$.next(question);
    this.currentQuestionSubject.next(question);
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers(question);
    
    // Log the outcome of isMultipleCorrectAnswers with the question details
    console.log(`Processing question:`, question, `isMultipleCorrectAnswers: ${this.shouldDisplayNumberOfCorrectAnswers}`);
  }

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    this.shouldDisplayExplanation = !!explanation;
  }

  getNumberOfCorrectAnswersText(
    numberOfCorrectAnswers: number | undefined
  ): string {
    if (numberOfCorrectAnswers === undefined || numberOfCorrectAnswers === 0) {
      return 'No correct answers';
    }

    const correctAnswersText =
      numberOfCorrectAnswers > 1
        ? `(${numberOfCorrectAnswers} answers are correct)`
        : '';

    return correctAnswersText;
  }

  calculateNumberOfCorrectAnswers(options: Option[]): number {
    const validOptions = options ?? [];
    const numberOfCorrectAnswers = validOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }
  
  /* isMultipleCorrectAnswers(): boolean {
    const currentQuestionValue = this.currentQuestion$.getValue();
    if (!currentQuestionValue) {
      return false;
    }
    const numberOfCorrectAnswers = currentQuestionValue.options.filter(
      (option) => option.correct
    ).length;
    return numberOfCorrectAnswers > 1;
  } */

  isMultipleCorrectAnswers(question: QuizQuestion): boolean {  
    if (!question || !Array.isArray(question.options)) {
      console.log('Question is invalid or has no options array.');
      return false;
    }
  
    const numberOfCorrectAnswers = question.options.filter(
      (option) => option.correct
    ).length;
  
    const isMultiple = numberOfCorrectAnswers > 1;
    console.log(`Number of correct answers: ${numberOfCorrectAnswers}. Is multiple: ${isMultiple}`);
  
    return isMultiple;
  }  
}
