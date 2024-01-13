import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion$.next(question);
    this.currentQuestionSubject.next(question);
    const currentQuestionValue = this.currentQuestion$.getValue();
    this.numberOfCorrectAnswers = currentQuestionValue.options.filter(
      (option) => option.correct
    ).length;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    this.shouldDisplayExplanation = !!explanation;
  }

  get explanationText$(): Observable<string | null> {
    return this.explanationTextSubject.asObservable();
  }

  getCurrentQuestion$(): Observable<QuizQuestion | null> {
    return this.currentQuestion$.asObservable();
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

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  isMultipleCorrectAnswers(): boolean {
    const currentQuestionValue = this.currentQuestion$.getValue();
    if (!currentQuestionValue) {
      return false;
    }
    const numberOfCorrectAnswers = currentQuestionValue.options.filter(
      (option) => option.correct
    ).length;
    return numberOfCorrectAnswers > 1;
  }
}
