import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizStateService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> 
    = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentOptionsSubject = new BehaviorSubject<Option[]>(null);
  // currentQuestion$ = this.currentQuestionSubject.asObservable();
  currentOptions$: Observable<Option[]> = of(null);

  private currentQuestionSource = new Subject<QuizQuestion>();
  currentQuestion$: Observable<QuizQuestion> = this.currentQuestionSource.asObservable();
  
  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private quizQuestionCreated = false;

  constructor() {}

  /* setCurrentQuestion(question$: Observable<QuizQuestion>): void {
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
      console.log('Current question:::', question);
      this.currentQuestion.next(question);
      this.currentQuestionSubject.next(question);
      this.currentQuestionSource.next(question);
      if (question && question.options) {
        console.log('Options:::', question.options);
        this.currentQuestion.next(question);
        this.currentOptionsSubject.next(question?.options || []);
      } else {
        console.log('No options found.');
      }
    });   
  } */

  setCurrentQuestion(question: QuizQuestion): void {
    console.log('Current question:::', question);
    this.currentQuestion.next(question);
    this.currentQuestionSubject.next(question);
    this.currentQuestionSource.next(question);
    if (question && question.options) {
      console.log('Options:::', question.options);
      this.currentQuestion.next(question);
      this.currentOptionsSubject.next(question?.options || []);
    } else {
      console.log('No options found.');
    }
  }
      
  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
  }

  isMultipleAnswer(): Observable<boolean> {
    const question = this.currentQuestion.value;
    if (!question) {
      console.error('Question is not defined');
      return of(false);
    }
  
    if (question && question.options) {
      const correctOptions = question.options?.filter((option) => option.correct);
      const isMultipleAnswer = correctOptions.length > 1;
      this.setMultipleAnswer(isMultipleAnswer);
    } else {
      console.error('Question options not found.', question);
      this.setMultipleAnswer(false);
    }
  
    return this.multipleAnswerSubject.asObservable();
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
