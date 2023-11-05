import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizQuestionManagerService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  explanationText: string;
  numberOfCorrectAnswers: number;
  shouldDisplayNumberOfCorrectAnswers = false;
  isOptionSelected = false;
  shouldDisplayExplanation = false;
  correctAnswersCount = 0;

  selectedOption: Option | null = null;

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);

  setSelectedOption(option: Option): void {
    this.selectedOption = option;
  }

  getSelectedOption(): Option | null {
    return this.selectedOption;
  }

  setCurrentQuestion(question: QuizQuestion): void {
    console.log('Setting Current Question:', question);
    this.currentQuestion.next(question);
    console.log(
      'Current Question Value After Set:',
      this.currentQuestion.getValue()
    );
    this.currentQuestionSubject.next(question);
    const currentQuestionValue = this.currentQuestion.getValue();
    this.numberOfCorrectAnswers = currentQuestionValue.options.filter(
      (option) => option.correct
    ).length;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  getCurrentQuestion(): any {
    return this.currentQuestion;
  }

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    this.shouldDisplayExplanation = !!explanation;
  }

  getExplanationText(): string | null {
    return this.explanationText;
  }

  get explanationText$(): Observable<string | null> {
    return this.explanationTextSubject.asObservable();
  }

  getCurrentQuestion$(): Observable<QuizQuestion | null> {
    return this.currentQuestion$.asObservable();
  }

  setExplanationDisplayed(displayed: boolean): void {
    this.shouldDisplayExplanation = displayed;
  }

  setNumberOfCorrectAnswers(count: number): void {
    this.numberOfCorrectAnswers = count;
    this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers();
  }

  getNumberOfCorrectAnswers(): number {
    return this.numberOfCorrectAnswers;
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
    const safeOptions = options ?? [];
    const numberOfCorrectAnswers = safeOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }

  shouldDisplayExplanationText(): boolean {
    return !!this.explanationText;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    if (!this.currentQuestion) {
      return false;
    }

    const hasMultipleCorrectAnswers = this.isMultipleCorrectAnswers();

    const displayNumberOfCorrectAnswers =
      this.shouldDisplayNumberOfCorrectAnswers &&
      hasMultipleCorrectAnswers &&
      !this.isOptionSelected &&
      !this.shouldDisplayExplanationText();

    return displayNumberOfCorrectAnswers && !this.shouldDisplayExplanation;
  }

  isMultipleCorrectAnswers(): boolean {
    const currentQuestionValue = this.currentQuestion.getValue();
    if (!currentQuestionValue) {
      return false;
    }
    const numberOfCorrectAnswers = currentQuestionValue.options.filter(
      (option) => option.correct
    ).length;
    return numberOfCorrectAnswers > 1;
  }
}
