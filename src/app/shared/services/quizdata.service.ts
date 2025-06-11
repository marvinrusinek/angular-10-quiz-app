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

  private isContentAvailableSubject = new BehaviorSubject<boolean>(false);
  public isContentAvailable$: Observable<boolean> = this.isContentAvailableSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadQuizzesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$.pipe(
      filter(quizzes => quizzes.length > 0),  // Ensure data is loaded
      take(1)  // Ensure it emits only once
    );
  }

  private loadQuizzesData(): void {
    this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap(quizzes => this.quizzesSubject.next(quizzes)),
      catchError(this.handleError)
    ).subscribe();
  }

  async loadQuizById(quizId: string): Promise<Quiz | null> {
    try {
      const quiz = await firstValueFrom(this.getQuiz(quizId).pipe(take(1))) as Quiz;
      if (!quiz || !quiz.questions?.length) {
        console.warn('[QuizDataService] Quiz invalid or empty:', quiz);
        return null;
      }
      return quiz;
    } catch (err) {
      console.error('[QuizDataService] Failed to fetch quiz:', err);
      return null;
    }
  }

  isValidQuiz(quizId: string): Observable<boolean> {
    return this.getQuizzes().pipe(
      map((quizzes: Quiz[]) => 
        quizzes.some((quiz) => quiz.quizId === quizId)
      ),
      catchError((error: any) => {
        console.error(`Error validating quiz ID "${quizId}":`, error.message || error);
        return of(false); // Return `false` to indicate an invalid quiz
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
      map((quizzes: Quiz[]) => {
        this.quizzes = quizzes;
        const selectedQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
  
        if (!selectedQuiz) {
          throw new Error(`Quiz with ID "${quizId}" not found.`);
        }
  
        this.setSelectedQuiz(selectedQuiz);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error retrieving quizzes:', error.message || error);
        return throwError(() => new Error('Error retrieving quizzes'));
      }),
      takeUntil(this.destroy$)
    );
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  getQuiz(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      filter(quizzes => {
        if (!Array.isArray(quizzes)) {
          return false; // wait until we get a real array
        }
      
        if (quizzes.length === 0) {
          return false;
        }
      
        return true;
      }),
      map(quizzes => {
        const quiz = quizzes.find(q => q.quizId === quizId);
        if (!quiz) {
          throw new Error(`[QuizDataService] ❌ Quiz with ID ${quizId} not found.`);
        }
        return quiz;
      }),
      take(1),
      catchError(error => {
        console.error(`[QuizDataService] ❌ Error fetching quiz:`, error);
        return of(null as Quiz);
      })
    );
  }
  
  updateContentAvailableState(isAvailable: boolean): void {
    this.isContentAvailableSubject.next(isAvailable);
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
        return quiz.questions.map((question, index) => ({
          ...question,
          options: question.options.map((option, optIndex) => ({
            ...option,
            optionId: optIndex, // Ensure optionId is set
            correct: option.correct ?? false // Default correct to false if undefined
          })),
        }));
      }),
      catchError(error => {
        console.error('Error fetching questions for quiz:', error);
        return of([]);
      })
    );
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]] | null> {
    if (typeof questionIndex !== 'number' || isNaN(questionIndex)) {
      console.error(`❌ Invalid questionIndex: ${questionIndex}`);
      return of(null);
    }
    
    return this.getQuiz(quizId).pipe(
      map(quiz => {
        if (!quiz || questionIndex < 0 || questionIndex >= quiz.questions.length) {
          console.error(`Question index ${questionIndex} out of bounds`);
          return null;
        }
        const question = quiz.questions[questionIndex];
        if (!question) {
          console.error(`No question found at index ${questionIndex}`);
          return null;
        }
  
        // Check for undefined options and handle accordingly
        const options = question.options ?? [];
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
      map((quiz) => this.extractOptions(quiz, questionIndex)),
      distinctUntilChanged(),
      catchError((error: HttpErrorResponse) => {
        console.error(`Error fetching options for quiz ID "${quizId}", question index ${questionIndex}:`, error.message);
        return throwError(() => new Error('Failed to fetch question options.'));
      })
    );
  }
  
  private extractOptions(quiz: Quiz, questionIndex: number): Option[] {
    if (!quiz.questions || quiz.questions.length <= questionIndex) {
      console.warn(`Question at index ${questionIndex} not found in quiz "${quiz.quizId}".`);
      return [];
    }
  
    return quiz.questions[questionIndex].options || [];
  }

  getAllExplanationTextsForQuiz(quizId: string): Observable<string[]> {
    return this.getQuiz(quizId).pipe(
      switchMap((quiz: Quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }

        const explanationTexts = quiz.questions.map((question) => {
          return typeof question.explanation === 'string' ? question.explanation : '';
        }) ?? [];

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
      this.question = question ?? null;
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

    const numCorrectAnswers = question.options.filter((option) => option?.correct ?? false).length;
    question.type = numCorrectAnswers > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
    this.questionType = question.type;
  }

  private mapQuestionType(type: QuestionType): 'single' | 'multiple' {
    return type === QuestionType.MultipleAnswer ? 'multiple' : 'single';
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error: HttpErrorResponse) => throwError(() => new Error(`Error submitting quiz ${quiz.quizId}: ` + error.message))),
      distinctUntilChanged()
    );
  }
}