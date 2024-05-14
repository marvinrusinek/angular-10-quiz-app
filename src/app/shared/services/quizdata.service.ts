import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, of, ReplaySubject, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';
import { isEqual } from 'lodash';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizDataService implements OnDestroy {
  questionType: string;

  quizzesSubject = new BehaviorSubject<Quiz[]>([]);
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
    this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap((quizzes: Quiz[]) => {
        console.log('Loaded quizzes:', quizzes); // Log loaded quizzes
        this.quizzesSubject.next(quizzes);
      }),
      catchError(this.handleError)
    ).subscribe();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$.pipe(distinctUntilChanged());
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  isValidQuiz(quizId: string): Observable<boolean> {
    return this.getQuizzes().pipe(
      tap(quizzes => console.log('Available quizzes:', quizzes)),
      map(quizzes => {
        const isValid = quizzes.some(quiz => quiz.quizId === quizId);
        console.log(`Checking validity for ${quizId}: ${isValid}`);
        return isValid;
      })
    );
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
      filter(quizzes => quizzes.length > 0),  // Ensure quizzes are loaded
      map((quizzes: Quiz[]) => {
        console.log('Available quizzes:', quizzes);
        const quiz = quizzes.find(quiz => quiz.quizId === quizId);
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
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

  async fetchQuestionAndOptionsFromAPI(quizId: string, currentQuestionIndex: number): 
    Promise<[QuizQuestion, Option[]] | null> {
    try {
      const questionAndOptions = await firstValueFrom(
        this.getQuestionAndOptions(quizId, currentQuestionIndex).pipe(take(1))
      ) as [QuizQuestion, Option[]];
      return questionAndOptions;
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
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
    console.error('Error:', error.message);
    return throwError(() => new Error(error.message));
  }

  fetchQuizQuestionByIdAndIndex(quizId: string, questionIndex: number): Observable<QuizQuestion | null> {
    if (!quizId) {
      console.error("Quiz ID is required but not provided.");
      return;
    }

    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      switchMap(result => {
        if (!result) {
          console.error(`Expected a tuple with QuizQuestion and Options from getQuestionAndOptions but received null for index ${questionIndex}`);
          return of(null); // Handle gracefully by returning null
        }
  
        const [question, options] = result;
        if (!question || !options) {
          console.error('Received incomplete data from getQuestionAndOptions:', result);
          return of(null);
        }
  
        question.options = options;
        return of(question);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error getting quiz question:', error);
        return throwError(() => new Error('An error occurred while fetching data: ' + error.message));
      }),
      distinctUntilChanged()
    );
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

  setQuestionType(question: QuizQuestion): void {
    const numCorrectAnswers = question.options.filter((option) => option.correct).length;
    question.type = numCorrectAnswers > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
    this.questionType = question.type;
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError(this.handleError)
    );
  }
}