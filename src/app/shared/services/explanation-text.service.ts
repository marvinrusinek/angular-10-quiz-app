import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >(null);

  constructor() {}

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  setExplanationText(
    selectedOptions: Option[],
    question?: QuizQuestion
  ): Observable<string> {
    console.log('Question Object:', question);
    console.log('Question Options:', question?.options);

    if (!Array.isArray(selectedOptions)) {
      console.error('Error: selectedOptions is not an array');
      return of('');
    }

    try {
      console.log('Question Options:::', question?.options);

      // const correctOptions = question?.options?.filter(option => option?.correct) || [];
      const correctOptions = (question?.options || []).filter(
        (option) => option?.correct
      );
      console.log('Correct Options:::', correctOptions);

      const selectedCorrectOptions = selectedOptions.filter(
        (option) => option?.correct === true
      );
      console.log('Selected Correct Options:', selectedCorrectOptions);
      console.log('Correct Options:::', correctOptions);

      if (selectedOptions.length === 0) {
        console.log('Setting Explanation Text to empty');
        this.explanationText$.next('');
      } else if (correctOptions.length === selectedCorrectOptions.length) {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );

        console.log('All Selected Options Are Correct');
        console.log('Correct Option Indices:', correctOptionIndices);

        if (correctOptions.length === 1) {
          const text = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
          console.log('Setting Explanation Text:', text);
          this.explanationText$.next(text);
        } else if (correctOptions.length > 1) {
          const correctOptionsString = correctOptionIndices.join(' and ');
          const text = `Options ${correctOptionsString} are correct because ${question.explanation}`;
          console.log('Setting Explanation Text:', text);
          this.explanationText$.next(text);
        }
      } else {
        const correctOptionIndices = correctOptions.map(
          (option) => question.options.indexOf(option) + 1
        );
        const optionIndicesString = correctOptionIndices.join(' and ');

        console.log('Some Selected Options Are Correct');
        console.log('Correct Option Indices:', correctOptionIndices);

        if (correctOptions.length === 1) {
          const text = `Option ${optionIndicesString} is correct because ${question.explanation}`;
          console.log('Setting Explanation Text:', text);
          this.explanationText$.next(text);
        } else {
          if (question && question.explanation) {
            const text = `Options ${optionIndicesString} are correct because ${question.explanation}`;
            console.log('Setting Explanation Text:', text);
            console.log('Generated Explanation Text:', text);
            this.explanationText$.next(text);
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
}

  /* setExplanationText(
    selectedOptions: Option[],
    question?: QuizQuestion
  ): Observable<string> {
    if (!Array.isArray(selectedOptions)) {
      console.error('Error: selectedOptions is not an array');
      return of('');
    }
  
    try {
      const correctOptions = (question?.options || []).filter(option => option?.correct);
      const correctOptionIds = correctOptions.map(option => option.optionId);
      
      const selectedCorrectOptions = selectedOptions.filter(
        option => correctOptionIds.includes(option.optionId)
      );
  
      if (selectedOptions.length === 0) {
        this.explanationText$.next('');
      } else if (correctOptions.length === selectedCorrectOptions.length) {
        if (correctOptions.length === 1) {
          const correctOption = correctOptions[0];
          const text = `Option ${correctOption.optionId} is correct because ${question.explanation}`;
          this.explanationText$.next(text);
        } else {
          const correctOptionsString = selectedCorrectOptions.map(option => `Option ${option.optionId}`).join(' and ');
          const text = `Options ${correctOptionsString} are correct because ${question.explanation}`;
          this.explanationText$.next(text);
        }
      } else {
        this.explanationText$.next('Options are incorrect because...');
      }
  
      return this.explanationText$;
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      this.explanationText$.next('');
      return this.explanationText$;
    }
  } */

