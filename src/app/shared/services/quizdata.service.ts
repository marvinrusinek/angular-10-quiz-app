import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizDataService implements OnDestroy {
  private quizUrl = 'assets/data/quiz.json';
  question: QuizQuestion | null = null;
  questionType: string;
  
  private destroy$ = new Subject<void>();

  private quizzesSubject = new BehaviorSubject<Quiz[]>([]);
  quizzes$ = this.quizzesSubject.asObservable();
  private quizzes: Quiz[] = [];

  selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);
  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadQuizzesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadQuizzesData(): void {
    this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap(quizzes => this.quizzesSubject.next(quizzes)),
      catchError(this.handleError)
    ).subscribe();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$.pipe(
      filter(quizzes => quizzes.length > 0),  // Ensure data is loaded
      take(1)  // Ensure it emits only once
    );
  }

  isValidQuiz(quizId: string): Observable<boolean> {
    return this.getQuizzes().pipe(
      map(quizzes => quizzes.some(quiz => quiz.quizId === quizId)),
      catchError(error => {
        console.error('Error validating quiz ID:', error);
        return of(false);
      })
    );
  }
  
  getCurrentQuizId(): string | null {
    const currentQuiz = this.currentQuizSubject.getValue();
    return currentQuiz ? currentQuiz.quizId : null;
  }

  setSelectedQuiz(quiz: Quiz | null): void {
    this.selectedQuiz$.next(quiz);
  }

  setSelectedQuizById(quizId: string): Observable<void> {
    return this.getQuizzes().pipe(
      switchMap((quizzes: Quiz[]) => {
        this.quizzes = quizzes;
        const quiz = this.quizzes.find((q) => q.quizId === quizId);
        if (!quiz) {
          console.error('Selected quiz not found');
          throw new Error('Selected quiz not found');
        }
        this.setSelectedQuiz(quiz);
        return of(undefined);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error retrieving quizzes:', error);
        throw new Error('Error retrieving quizzes');
      }),
      takeUntil(this.destroy$)
    );
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  getQuiz(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      filter(quizzes => quizzes.length > 0), // Ensure quizzes are loaded
      map(quizzes => {
        const quiz = quizzes.find(q => q.quizId === quizId);
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        return quiz;
      }),
      take(1), // Ensure it completes after one emission
      catchError(error => {
        console.error('Error fetching quiz:', error);
        return of(null as Quiz);
      })
    );
  }
  
  private handleError(error: any): Observable<never> {
    console.error('Error:', error.message);
    return throwError(() => new Error(error.message));
  }

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(
      map(quiz => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        if (!quiz.questions) {
          throw new Error(`Quiz with ID ${quizId} has no questions`);
        }
        return quiz.questions.map(question => ({ ...question }));
      }),
      catchError(error => {
        console.error('Error fetching questions for quiz:', error);
        return of([]);
      })
    );
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]] | null> {
    return this.getQuiz(quizId).pipe(
      map(quiz => {
        if (!quiz || questionIndex < 0 || questionIndex >= quiz.questions.length) {
          console.error(`Question index ${questionIndex} out of bounds`);
          return null;
        }
        const question = quiz.questions[questionIndex];
  
        // Check for undefined options and handle accordingly
        const options = question.options || [];
        if (options.length === 0) {
          console.warn(`No options found for question at index ${questionIndex}`);
        }
  
        return [question, options] as [QuizQuestion, Option[]];
      }),
      catchError(error => {
        console.error('Error fetching question and options:', error);
        return of(null);
      })
    );
  }

  fetchQuizQuestionByIdAndIndex(quizId: string, questionIndex: number): Observable<QuizQuestion | null> {
    if (!quizId) {
      console.error("Quiz ID is required but not provided.");
      return of(null);
    }

    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      switchMap(result => {
        if (!result) {
          console.error(`Expected a tuple with QuizQuestion and Options from getQuestionAndOptions but received null for index ${questionIndex}`);
          return of(null);
        }

        const [question, options] = result;
        if (!question || !options) {
          console.error('Received incomplete data from getQuestionAndOptions:', result);
          return of(null);
        }

        question.options = options;
        return of(question);
      }),
      catchError((error) => {
        console.error('Error getting quiz question:', error);
        return throwError(() => new Error('An error occurred while fetching data: ' + error.message));
      }),
      distinctUntilChanged()
    );
  }

  async fetchQuestionAndOptionsFromAPI(quizId: string, currentQuestionIndex: number): Promise<[QuizQuestion, Option[]] | null> {
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

  getOptions(quizId: string, questionIndex: number): Observable<Option[]> {
    return this.getQuiz(quizId).pipe(
      map(quiz => quiz.questions[questionIndex].options),
      catchError((error: HttpErrorResponse) => throwError(() => new Error('Error fetching question options: ' + error.message))),
      distinctUntilChanged()
    );
  }

  getAllExplanationTextsForQuiz(quizId: string): Observable<string[]> {
    return this.getQuiz(quizId).pipe(
      switchMap((quiz: Quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }

        const explanationTexts = quiz.questions.map((question) => {
          // Check if explanation is defined and not null
          if (typeof question.explanation === 'string') {
            return question.explanation;
          } else {
            return '';
          }
        });

        return of(explanationTexts);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error getting explanation texts:', error);
        return of([]);
      })
    );
  }

  async asyncOperationToSetQuestion(quizId: string, currentQuestionIndex: number): Promise<void> {
    try {
      if (!quizId || currentQuestionIndex < 0) {
        console.error('Invalid quiz ID or question index');
        return;
      }
  
      const observable = this.fetchQuizQuestionByIdAndIndex(quizId, currentQuestionIndex);
      if (!observable) {
        console.error('Received undefined Observable from fetchQuizQuestionByIdAndIndex');
        return;
      }
  
      const question = await firstValueFrom(observable);
      if (!question) {
        console.error('No question received for the given index');
        return;
      }
  
      this.question = question;
    } catch (error) {
      console.error('Error setting question:', error);
    }
  }

  setQuestionType(question: QuizQuestion): void {
    if (!question) {
      console.error('Question is undefined or null:', question);
      return;
    }

    if (!Array.isArray(question.options)) {
      console.error('Question options is not an array:', question.options);
      return;
    }

    if (question.options.length === 0) {
      console.warn('Question options array is empty:', question.options);
      return;
    }

    const numCorrectAnswers = question.options.filter((option) => option.correct).length;
    question.type = numCorrectAnswers > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
    this.questionType = question.type;
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => new Error(`Error submitting quiz ${quiz.quizId}: ` + error.message))),
      distinctUntilChanged()
    );
  }
}
