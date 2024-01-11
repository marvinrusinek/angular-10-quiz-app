import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, throwError } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root'
})
export class QuizStateService {
  currentQuestion: BehaviorSubject<QuizQuestion | null> 
    = new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSource = new Subject<QuizQuestion>();
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion> = this.currentQuestionSubject.asObservable();

  currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSubject.asObservable();

  multipleAnswer$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);

  private quizQuestionCreated = false;

  constructor() {}

  setCurrentQuestion(question$: Observable<QuizQuestion | null>): void {
    if (question$ === null || question$ === undefined) {
      throwError('Question$ is null or undefined.');
      return;
    }
  
    question$.pipe(
      catchError((error: any) => {
        console.error(error);
        return throwError(error);
      }),
      distinctUntilChanged()
    ).subscribe((question: QuizQuestion) => {
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

  updateCurrentQuestion(newQuestion: QuizQuestion): void {
    this.currentQuestionSubject.next(newQuestion); 
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
  }

  /* isMultipleAnswer(question: QuizQuestion): Observable<boolean> {
    console.log("MY QOPTS", question.options);
    try {
      let correctAnswersCount: number;
      if (question && Array.isArray(question.options)) {
        // Check if the question has more than one correct answer
        correctAnswersCount = question.options
          .filter(option => option.correct)
          .length;
        console.log('Correct answers count:', correctAnswersCount);

        console.log('Question:', question, 'isMultipleAnswer:', correctAnswersCount > 1);
  
        return of(correctAnswersCount > 1);
      } else {
        correctAnswersCount = 0;
        return of(false);
      }
    } catch (error) {
      console.error('Error determining if it is a multiple-answer question:', error);
      return of(false);
    }
  } */

  isMultipleAnswer(data: QuizQuestion): Observable<boolean> {
    if (data && Array.isArray(data.options)) {
      const correctAnswersCount = data.options.filter(option => option.correct).length;
      console.log('Question:', data.questionText, 'Correct answers count:', correctAnswersCount);
      return of(correctAnswersCount > 1);
    } else {
      return of(false);
    }
  }
  

  setQuizQuestionCreated(): void {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated(): boolean {
    return this.quizQuestionCreated;
  }
}
