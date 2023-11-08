import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';
import { isObject } from 'lodash';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> 
    = new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSource = new Subject<QuizQuestion>();
  currentQuestion$: Observable<QuizQuestion> = this.currentQuestionSubject.asObservable();

  currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSubject.asObservable();

  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private quizQuestionCreated = false;

  constructor() {}

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (!question$) {
      throwError('Question$ is null or undefined.');
      return;
    }
  
    question$.pipe(
      catchError((error) => {
        console.error(error);
        return throwError(error);
      }),
      distinctUntilChanged()
    ).subscribe((question) => {
      this.currentQuestion.next(question);
      this.currentQuestionSubject.next(question);
      this.currentQuestionSource.next(question);

      if (question && question.options) {
        this.currentQuestion.next(question);
        this.currentOptionsSubject.next(question?.options || []);
      } else {
        console.log('No options found.');
      }
    });
  }
      
  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
  }

  isMultipleAnswer(question: QuizQuestion): Observable<boolean> {
    if (!question || !isObject(question) || !('options' in question)) {
      console.error('Question is not defined or is in an invalid format');
      this.setMultipleAnswer(false);
      return of(false);
    }

    if (!Array.isArray(question.options)) {
      console.error('Question options not found.', question);
      this.setMultipleAnswer(false);
      return of(false);
    }

    const correctOptions = question.options?.filter((option) => option.correct);
    const isMultipleAnswer = correctOptions.length > 1;
    this.setMultipleAnswer(isMultipleAnswer);
    return of(isMultipleAnswer).pipe(
      catchError((error) => {
        console.error('Error determining if it is a multiple answer question:', error);
        this.setMultipleAnswer(false);
        return throwError(false);
      })
    );
  }

  setMultipleAnswer(value: boolean): void {
    this.multipleAnswerSubject.next(value);
    this.multipleAnswer$.subscribe((value) => {
      this.multipleAnswerSubject.next(value);
    });
  }

  setQuizQuestionCreated(): void {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated(): boolean {
    return this.quizQuestionCreated;
  }
}
