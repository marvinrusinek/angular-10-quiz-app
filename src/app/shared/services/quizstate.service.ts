import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, distinctUntilChanged } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion | null> = this.currentQuestionSubject.asObservable();

  // private currentOptionsSource: BehaviorSubject<Option[] | null> = new BehaviorSubject<Option[] | null>(null);
  // currentOptions$: Observable<Option[] | null> = this.currentOptionsSource.asObservable();

  private currentOptionsSource: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSource.asObservable();


  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$: Observable<boolean> = this.multipleAnswerSubject.asObservable();

  private quizQuestionCreated = false;

  constructor() {}

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (!question$) {
      console.error('Question$ is null or undefined.');
      return;
    }

    question$.pipe(
      catchError((error) => {
        console.error(error);
        return throwError(error);
      }),
      distinctUntilChanged()
    ).subscribe((question) => {
      console.log('Current question:::', question);
      this.currentQuestionSubject.next(question);
      if (question && question.options) {
        console.log('Options:::', question.options);
        this.currentOptionsSource.next(question.options || []);
      } else {
        console.log('No options found.');
        this.currentOptionsSource.next([]);
      }
    });
  }

  getCurrentQuestion(): Observable<QuizQuestion | null> {
    return this.currentQuestion$;
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptionsSource.next(options);
  }

  isMultipleAnswer(): Observable<boolean> {
    const question = this.currentQuestionSubject.value;
    if (!question) {
      console.error('Question is not defined');
      return this.multipleAnswerSubject;
    }

    if (question && question.options) {
      const correctOptions = question.options?.filter((option) => option.correct);
      const isMultipleAnswer = correctOptions.length > 1;
      this.setMultipleAnswer(isMultipleAnswer);
    } else {
      console.error('Question options not found.', question);
      this.setMultipleAnswer(false);
    }

    return this.multipleAnswerSubject;
  }

  setMultipleAnswer(value: boolean): void {
    this.multipleAnswerSubject.next(value);
  }

  setQuizQuestionCreated(): void {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated(): boolean {
    return this.quizQuestionCreated;
  }
}
