import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizQuestionManagerService {
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  explanationText: string;
  shouldDisplayNumberOfCorrectAnswers = false;
  shouldDisplayExplanation = false;
  correctAnswersCount = 0; // not currently being used
  selectedOption: Option | null = null;

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

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

  updateCurrentQuestionDetail(question: QuizQuestion): void {
    this.currentQuestion$.next(question);
    this.currentQuestionSubject.next(question);
    // this.shouldDisplayNumberOfCorrectAnswers = this.isMultipleCorrectAnswers(question);
    this.shouldDisplayNumberOfCorrectAnswers = !this.shouldDisplayExplanation && this.isMultipleCorrectAnswers(question);
  }

  calculateNumberOfCorrectAnswers(options: Option[]): number {
    const validOptions = options ?? [];
    const numberOfCorrectAnswers = validOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }

  isMultipleCorrectAnswers(question: QuizQuestion): boolean {  
    if (!question || !Array.isArray(question.options)) {
      console.log('Question is invalid or has no options array.');
      return false;
    }
  
    const numberOfCorrectAnswers = question.options.filter(
      (option) => option.correct
    ).length;
  
    const isMultiple = numberOfCorrectAnswers > 1;  
    return isMultiple;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
  }

  isValidQuestionData(questionData: QuizQuestion): boolean {
    return !!questionData && !!questionData.explanation;
  }
}
