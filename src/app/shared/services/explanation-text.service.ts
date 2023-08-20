import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);

  private nextExplanationTextSource = new BehaviorSubject<string>('');
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(false);
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  constructor() {}

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
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
          const text = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
          this.explanationText$.next(text);
        } else if (correctOptions.length > 1) {
          const correctOptionsString = correctOptionIndices.join(' and ');
          const text = `Options ${correctOptionsString} are correct because ${question.explanation}`;
          this.explanationText$.next(text);
          this.setNextExplanationText(text);
        }
      } else {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );
        const optionIndicesString = correctOptionIndices.join(' and ');

        if (correctOptions.length === 1) {
          const text = `Option ${optionIndicesString} is correct because ${question.explanation}`;
          this.explanationText$.next(text);
          this.setNextExplanationText(text);
        } else {
          if (question && question.explanation) {
            const text = `Options ${optionIndicesString} are correct because ${question.explanation}`;
            this.explanationText$.next(text);
            this.setNextExplanationText(text);
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

  setNextExplanationText(explanationText: string): void {
    this.nextExplanationTextSource.next(explanationText);
  }

  setIsExplanationTextDisplayed(display: boolean): void {
    this.isExplanationTextDisplayedSource.next(display);
  }
}