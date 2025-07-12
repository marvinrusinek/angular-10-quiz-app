import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizQuestionManagerService {
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);

  private shouldDisplayExplanationSubject = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSubject.asObservable();

  private currentQuestionSubject: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  private explanationTextSubject: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  selectedOption: Option | null = null;
  explanationText: string;
  shouldDisplayNumberOfCorrectAnswers = false;
  shouldDisplayNumberOfCorrectAnswers$: Observable<boolean>;

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    this.shouldDisplayExplanationSubject.next(!!explanation);
  }

  getNumberOfCorrectAnswersText(
    numberOfCorrectAnswers: number | undefined
  ): string {
    if ((numberOfCorrectAnswers ?? 0) === 0) {
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

    this.shouldDisplayNumberOfCorrectAnswers$ = combineLatest([
      this.shouldDisplayExplanation$, // Observable<boolean>
      this.currentQuestion$ // Observable<Question>
    ]).pipe(
      map(([shouldExplain, question]) => {
        return !shouldExplain && this.isMultipleAnswerQuestion(question);
      })
    );
  }

  calculateNumberOfCorrectAnswers(options: Option[]): number {
    const validOptions = options ?? [];
    const numberOfCorrectAnswers = validOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }

  public isMultipleAnswerQuestion(question: QuizQuestion): Observable<boolean> {
    try {
      if (question && Array.isArray(question.options)) {
        const correctAnswersCount = question.options.filter(option => option.correct).length;
        const hasMultipleAnswers = correctAnswersCount > 1;
        return of(hasMultipleAnswers);
      } else {
        return of(false);
      }
    } catch (error) {
      console.error('Error determining if it is a multiple-answer question:', error);
      return of(false);
    }
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
  }

  isValidQuestionData(questionData: QuizQuestion): boolean {
    return !!questionData && !!questionData.explanation;
  }
}
