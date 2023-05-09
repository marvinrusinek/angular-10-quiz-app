import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

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
  currentQuestion$ = this.currentQuestionSubject.asObservable();
  currentOptions$: Observable<Option[]> = of(null);
  
  /* multipleAnswerSubject: BehaviorSubject<boolean> 
    = new BehaviorSubject<boolean>(false);
  multipleAnswer: boolean = false; */

  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private quizQuestionCreated = false;

  constructor() { 
    console.log("QUIZ-STATE-SERVICE");
  }

  setCurrentQuestion(question$: Observable<QuizQuestion>): void {
    if (!question$) {
      throwError('Question$ is null or undefined.');
      return;
    }
  
    question$.pipe(
      catchError((error) => {
        console.error(error);
        return throwError(error);
      })
    ).subscribe((question) => {
      this.currentQuestion.next(question);
      this.currentQuestionSubject.next(question);
      if (question && question.options) {
        this.currentOptionsSubject.next(question.options);
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

  setQuizQuestionCreated() {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated() {
    return this.quizQuestionCreated;
  }
}
