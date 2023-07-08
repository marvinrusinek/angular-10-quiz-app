import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root'
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  private explanationTextSubject: BehaviorSubject<string> =
    new BehaviorSubject<string>('');

  constructor() { }

  public getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  public setExplanationText(
    selectedOptions: Option[],
    question?: QuizQuestion
  ): Observable<string> {
    if (!Array.isArray(selectedOptions)) {
      console.error('Error: selectedOptions is not an array');
      return of('');
    }
  
    if (!question) {
      console.error('Error: question is undefined');
      return of('');
    }
  
    try {
      const correctOptions = question.options.filter((option) => option?.correct);
      const selectedCorrectOptions = selectedOptions.filter(
        (option) => option?.correct !== undefined && option?.correct
      );
  
      if (selectedOptions.length === 0) {
        this.explanationTextSubject.next('');
        return this.explanationTextSubject.asObservable();
      } else if (correctOptions.length === selectedCorrectOptions.length) {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );
  
        if (correctOptions.length === 1) {
          const text = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
          this.explanationTextSubject.next(text);
        } else if (correctOptions.length > 1) {
          const correctOptionsString = correctOptionIndices.join(' and ');
          const text = `Options ${correctOptionsString} are correct because ${question.explanation}`;
          this.explanationTextSubject.next(text);
        }
      } else {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );
        const optionIndicesString = correctOptionIndices.join(' and ');
  
        if (correctOptions.length === 1) {
          const text = `Option ${optionIndicesString} is correct because ${question.explanation}`;
          this.explanationTextSubject.next(text);
        } else {
          const text = `Options ${optionIndicesString} are correct because ${question.explanation}`;
          this.explanationTextSubject.next(text);
        }
      }
  
      return this.explanationTextSubject.asObservable();
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationTextSubject.next('');
      return this.explanationTextSubject.asObservable();
    }
  }
}
