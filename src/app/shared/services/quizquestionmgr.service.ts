import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizQuestionManagerService {
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$ = this.currentQuestionSubject.asObservable();

  private shouldDisplayExplanationSubject = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ = this.shouldDisplayExplanationSubject.asObservable();

  private explanationTextSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  selectedOption: Option | null = null;
  explanationText: string;
  shouldDisplayNumberOfCorrectAnswers = false;
  shouldDisplayNumberOfCorrectAnswers$: Observable<boolean>;

  setExplanationText(explanation: string): void {
    this.explanationTextSubject.next(explanation);
    this.shouldDisplayExplanationSubject.next(!!explanation);
  }

  getNumberOfCorrectAnswersText(
    numberOfCorrectAnswers: number | undefined,
    totalOptions: number | undefined
  ): string {
    if ((numberOfCorrectAnswers ?? 0) === 0) {
      return 'No correct answers';
    }

    if (!totalOptions || totalOptions <= 0) {
      return numberOfCorrectAnswers === 1
        ? '(1 answer is correct)'
        : `(${numberOfCorrectAnswers} answers are correct)`;
    }

    const pluralSuffix = numberOfCorrectAnswers === 1 ? 'answer is' : 'answers are';
    return `(${numberOfCorrectAnswers}/${totalOptions} ${pluralSuffix} correct)`;
  }

  updateCurrentQuestionDetail(question: QuizQuestion): void {
    this.currentQuestionSubject.next(question);

    this.shouldDisplayNumberOfCorrectAnswers$ = combineLatest([
      this.shouldDisplayExplanation$,
      this.currentQuestion$
    ]).pipe(
      switchMap(([shouldExplain, question]) =>
        this.isMultipleAnswerQuestion(question).pipe(
          map((isMultiple) => !shouldExplain && isMultiple)
        )
      )
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