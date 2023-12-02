import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, delay, distinctUntilChanged, map } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false'
}

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
    try {
      const isMultipleAnswer = question.type === QuestionType.MultipleAnswer;
      console.log('Question Type:::>>', question.type);
      this.setMultipleAnswer(isMultipleAnswer);
      return of(isMultipleAnswer);
    } catch (error) {
      console.error('Error determining if it is a multiple-answer question:', error);
      this.setMultipleAnswer(false);
      return of(false);
    }
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
