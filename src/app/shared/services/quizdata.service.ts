import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, ReplaySubject, Subject, throwError } from 'rxjs';
import { catchError, delay, distinctUntilChanged, filter, map, retryWhen, shareReplay, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { isEqual } from 'lodash';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizDataService implements OnDestroy {
  private quizzesSubject = new BehaviorSubject<Quiz[]>([]);
  quizzes$ = this.quizzesSubject.asObservable();
  
  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);
  selectedQuiz$ = this.selectedQuizSubject.asObservable();
  
  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();
  
  private questionAndOptionsSubject = new ReplaySubject<[QuizQuestion, Option[]]>(1);
  questionAndOptions$ = this.questionAndOptionsSubject.asObservable();
  
  private quizUrl = 'assets/data/quiz.json';
  private destroy$ = new Subject<void>();

  constructor(private http: HttpClient) {
    this.loadQuizzesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQuizzesData(): void {
    this.http.get<Quiz[]>(this.quizUrl)
      .pipe(
        tap(quizzes => this.quizzesSubject.next(quizzes)),
        catchError(this.handleError)
      )
      .subscribe();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$.pipe(distinctUntilChanged());
  }

  isValidQuiz(quizId: string): Observable<boolean> {
    return this.quizzes$.pipe(
      map(quizzes => quizzes.some(quiz => quiz.quizId === quizId))
    );
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  setSelectedQuiz(quiz: Quiz | null): void {
    this.selectedQuizSubject.next(quiz);
  }

  setSelectedQuizById(quizId: string): void {
    this.quizzes$.pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === quizId)),
      tap(quiz => this.selectedQuizSubject.next(quiz)),
      catchError(this.handleError)
    ).subscribe();
  }

  getQuiz(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map((quizzes): Quiz => {
        const quiz = quizzes.find(quiz => quiz.quizId === quizId);
        if (!quiz) {
          throw new Error('Quiz not found');
        }
        return quiz;
      }),
      catchError(this.handleError)
    );
  }

  getQuizById(quizId: string): Observable<Quiz> {
    if (!quizId) {
      throw new Error(`Quiz ID is undefined`);
    }

    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId)),
      switchMap((quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        return of(quiz);
      }),
      distinctUntilChanged(
        (prevQuiz, currQuiz) =>
          JSON.stringify(prevQuiz) === JSON.stringify(currQuiz)
      ),
      shareReplay()
    );
  }

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(
      map(quiz => quiz.questions),
      distinctUntilChanged(isEqual)
    );
  }

  getOptions(quizId: string, questionIndex: number): Observable<Option[]> {
    return this.getQuiz(quizId).pipe(
      map(quiz => quiz.questions[questionIndex]?.options),
      catchError(this.handleError)
    );
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]] | null> {
    return this.getQuiz(quizId).pipe(
      map((quiz): [QuizQuestion, Option[]] | null => {
        const question = quiz.questions[questionIndex];
        return question ? [question, question.options] : null;
      }),
      catchError(this.handleError)
    );
  }

  /* private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('Error:', error);
    return throwError(() => new Error('An error occurred while fetching data: ' + error.message));
  } */

  private handleError(error: any): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof HttpErrorResponse) {
      errorMessage = `An error occurred while fetching data: ${error.message}`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error('Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  async asyncOperationToSetQuestion(quizId: string, currentQuestionIndex: number): Promise<void> {
    try {
      const question = await firstValueFrom(this.getQuestionAndOptions(quizId, currentQuestionIndex));
      if (question) {
        this.questionAndOptionsSubject.next(question);
      }
    } catch (error) {
      console.error('Error setting question:', error);
    }
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError(this.handleError)
    );
  }
}