import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, map } from 'rxjs/operators';

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

  isMultipleAnswer(question: QuizQuestion): BehaviorSubject<boolean> {
    console.log('Received question::>>', question);
    console.log('Type of question::>>', typeof question);
    console.log('Keys of question object::>>', Object.keys(question));

    const resultSubject = new BehaviorSubject<boolean>(false);
  
    if (!question || typeof question !== 'object' || typeof question.type !== 'string' || !question.type.trim()) {
      console.error('Invalid question:', question);
      console.error('Type of question:', typeof question, 'Type of type property:', typeof question.type);

      this.setMultipleAnswer(false);
      resultSubject.next(false);
      resultSubject.complete(); // Complete the subject
    } else {
      // Perform the logic to determine if it's a multiple-answer question
      const isMultipleAnswer = question.type === QuestionType.MultipleAnswer;
      resultSubject.next(isMultipleAnswer);
      resultSubject.complete(); // Complete the subject
    }
  
    return resultSubject;
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
