import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { firstValueFrom } from '../../shared/utils/rxjs-compat';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizShuffleService } from '../../shared/services/quiz-shuffle.service';
import { Utils } from '../../shared/utils/utils';

@Injectable({ providedIn: 'root' })
export class QuizDataService implements OnDestroy {
  private quizUrl = 'assets/data/quiz.json';
  question: QuizQuestion | null = null;
  questionType: string;
  
  private destroy$ = new Subject<void>();

  private quizzesSubject = new BehaviorSubject<Quiz[]>([]);
  quizzes$ = this.quizzesSubject.asObservable();
  private quizzes: Quiz[] = [];
  private readonly quizQuestionCache = new Map<string, QuizQuestion[]>();

  selectedQuiz$: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);
  selectedQuizSubject = new BehaviorSubject<Quiz | null>(null);

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  private isContentAvailableSubject = new BehaviorSubject<boolean>(false);
  public isContentAvailable$: Observable<boolean> = this.isContentAvailableSubject.asObservable();

  constructor(
    private quizService: QuizService,
    private quizShuffleService: QuizShuffleService,
    private http: HttpClient
  ) {
    this.loadQuizzesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.quizzes$.pipe(
      filter(quizzes => quizzes.length > 0),  // ensure data is loaded
      take(1)  // ensure it emits only once
    );
  }

  private loadQuizzesData(): void {
    this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap(quizzes => {
        this.quizzes = Array.isArray(quizzes) ? [...quizzes] : [];
        this.quizzesSubject.next(quizzes);
      }),
      catchError(this.handleError)
    ).subscribe();
  }

  /**
   * Returns a synchronously cached quiz instance, if available.
   * Falls back to `null` when the quizzes list has not been populated yet
   * or when the requested quiz cannot be found.
   */
  getCachedQuizById(quizId: string): Quiz | null {
    if (!quizId) return null;

    return this.quizzes.find((quiz) => quiz.quizId === quizId) ?? null;
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
        return of(false);  // return `false` to indicate an invalid quiz
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

  getSelectedQuizSnapshot(): Quiz | null {
    return this.selectedQuiz$.getValue();
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

  getCurrentQuizSnapshot(): Quiz | null {
    return this.currentQuizSubject.getValue();
  }

  getQuiz(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      filter(quizzes => {
        if (!Array.isArray(quizzes)) {
          return false;  // wait until we get a real array
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

  /** Return a brand-new array of questions with fully-cloned options. */
  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(
      map(quiz => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
        if (!quiz.questions || quiz.questions.length === 0) {
          throw new Error(`Quiz with ID ${quizId} has no questions`);
        }
  
        // Normalizer for options after any (re)ordering
        const sanitizeOptions = (options: Option[] = []): Option[] =>
          this.quizShuffleService.assignOptionIds(options, 1).map((option) => ({
            ...option,
            correct: option.correct === true,
            selected: option.selected === true,
            highlight: option.highlight ?? false,
            showIcon: option.showIcon ?? false
          }));
  
        // Deep-clone base questions (options cloned too) – your requested addition
        const baseQuestions: QuizQuestion[] = (quiz.questions ?? []).map((question) => ({
          ...question,
          options: (question.options ?? []).map(option => ({ ...option }))
        }));
  
        let preparedQuestions: QuizQuestion[] = baseQuestions;
  
        if (this.quizService.isShuffleEnabled()) {
          // Prepare & build shuffled set
          this.quizShuffleService.prepareShuffle(quizId, baseQuestions);
          preparedQuestions = this.quizShuffleService.buildShuffledQuestions(
            quizId,
            baseQuestions
          );
        } else {
          // Clear any prior shuffle state and still build in identity order
          this.quizShuffleService.clear(quizId);
          preparedQuestions = this.quizShuffleService.buildShuffledQuestions(
            quizId,
            baseQuestions
          );
        }
  
        // Ensure options in the final payload are sanitized/normalized
        preparedQuestions = preparedQuestions.map(q => {
          const sanitizedOptions = sanitizeOptions(q.options ?? []);
          return {
            ...q,
            options: sanitizedOptions,
            answer: this.quizShuffleService.alignAnswersWithOptions(q.answer, sanitizedOptions)
          };
        });
  
        // Cache + wire into session state
        this.quizQuestionCache.set(quizId, preparedQuestions);
        this.quizService.applySessionQuestions(quizId, preparedQuestions);
        this.syncSelectedQuizState(quizId, preparedQuestions, quiz);
  
        return preparedQuestions;
      }),
      catchError(error => {
        console.error('[QuizDataService] getQuestionsForQuiz:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Ensure the quiz session questions are available before starting a quiz.
   * Reuses any cached clone for the quiz and re-applies it to the quiz service
   * so downstream consumers receive a consistent question set.
   */
  prepareQuizSession(quizId: string): Observable<QuizQuestion[]> {
    if (!quizId) {
      console.error('[prepareQuizSession] quizId is required.');
      return of([]);
    }

    const cached = this.quizQuestionCache.get(quizId);
    if (Array.isArray(cached) && cached.length > 0) {
      this.quizService.applySessionQuestions(quizId, cached);
      this.syncSelectedQuizState(quizId, cached);
      return of(cached);
    }

    return this.getQuestionsForQuiz(quizId).pipe(
      catchError((error: Error) => {
        console.error('[prepareQuizSession] Failed to fetch questions:', error);
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
        const cachedQuestions = this.quizQuestionCache.get(quizId);
        const questionsToUse = cachedQuestions ?? quiz?.questions ?? [];

        if (questionIndex < 0 || questionIndex >= questionsToUse.length) {
          console.error(`Question index ${questionIndex} out of bounds`);
          return null;
        }

        const question = questionsToUse[questionIndex];
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

  fetchQuizQuestionByIdAndIndex(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
  
    if (!quizId) {
      console.error('Quiz ID is required but not provided.');
      return of(null);
    }
  
    // Get the total-question count
    return this.quizService.getTotalQuestionsCount(quizId).pipe(
      take(1),
      switchMap(totalQuestions => {
        // Index-bounds guard now that we have the number
        if (!Number.isFinite(totalQuestions) || totalQuestions <= 0) {
          console.error(
            `[fetchQuizQuestionByIdAndIndex] ❌ Invalid totalQuestions (${totalQuestions}) for quiz ${quizId}`
          );
          return of(null);
        }
  
        const maxIndex = totalQuestions - 1;
        if (questionIndex < 0 || questionIndex > maxIndex) {
          console.warn(
            `[fetchQuizQuestionByIdAndIndex] Index ${questionIndex} out of range (0-${maxIndex}).`
          );
          return of(null);
        }
  
        // Fall through to existing tuple-fetch logic
        return this.getQuestionAndOptions(quizId, questionIndex).pipe(
          switchMap(result => {
            if (!result) {
              console.error(
                `Expected a tuple with QuizQuestion and Options from getQuestionAndOptions but received null for index ${questionIndex}`
              );
              return of(null);
            }
  
            const [question, options] = result;
            if (!question || !options) {
              console.error(
                'Received incomplete data from getQuestionAndOptions:',
                result
              );
              return of(null);
            }
  
            question.options = options;
            return of(question);
          })
        );
      }),
      // Unchanged operators
      distinctUntilChanged(),
      catchError(err => {
        console.error('Error getting quiz question:', err);
        return throwError(
          () => new Error('An error occurred while fetching data: ' + err.message)
        );
      })
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
      map((quiz) => {
        const cachedQuestions = this.quizQuestionCache.get(quizId);
        if (cachedQuestions) {
          if (questionIndex < 0 || questionIndex >= cachedQuestions.length) {
            console.warn(`Question at index ${questionIndex} not found in cached quiz "${quizId}".`);
            return [];
          }

          return cachedQuestions[questionIndex].options ?? [];
        }

        return this.extractOptions(quiz, questionIndex);
      }),
      distinctUntilChanged(),
      catchError((error: HttpErrorResponse) => {
        console.error(`Error fetching options for quiz ID "${quizId}", question index ${questionIndex}:`, error.message);
        return throwError(() => new Error('Failed to fetch question options.'));
      })
    );
  }
  
  private extractOptions(quiz: Quiz, questionIndex: number): Option[] {
    if (!quiz?.questions || quiz.questions.length <= questionIndex) {
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

        const sourceQuestions = this.quizQuestionCache.get(quizId) ?? quiz.questions ?? [];

        const explanationTexts = sourceQuestions.map((question) => {
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

  private syncSelectedQuizState(
    quizId: string,
    questions: QuizQuestion[],
    sourceQuiz?: Quiz | null
  ): void {
    if (!Array.isArray(questions) || questions.length === 0) return;

    const baseQuiz =
      sourceQuiz ??
      this.selectedQuiz$.getValue() ??
      this.quizService.selectedQuiz ??
      this.getCachedQuizById(quizId);

    if (!baseQuiz) return;

    const sanitizedQuestions = questions.map((question) => ({
      ...question,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({ ...option }))
        : []
    }));

    const syncedQuiz: Quiz = {
      ...baseQuiz,
      quizId: baseQuiz.quizId ?? quizId,
      questions: sanitizedQuestions
    };

    this.setSelectedQuiz(syncedQuiz);
    this.setCurrentQuiz(syncedQuiz);
    this.quizService.setSelectedQuiz(syncedQuiz);
    this.quizService.setActiveQuiz(syncedQuiz);
  }
}