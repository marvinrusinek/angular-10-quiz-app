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
  private readonly baseQuizQuestionCache = new Map<string, QuizQuestion[]>();
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
  
        // ── Build normalized base questions (clone options per question) ──
        const baseQuestions: QuizQuestion[] = (quiz.questions ?? [])
          .map((question) => this.normalizeQuestion(question));
        const shouldShuffle = this.quizService.isShuffleEnabled();
        const sessionQuestions = this.buildSessionQuestions(
          quizId,
          baseQuestions,
          shouldShuffle
        );
  
        this.quizQuestionCache.set(quizId, this.cloneQuestions(sessionQuestions));
        this.quizService.applySessionQuestions(quizId, this.cloneQuestions(sessionQuestions));
        this.syncSelectedQuizState(quizId, sessionQuestions, quiz);

        return this.cloneQuestions(sessionQuestions);
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
      const sessionReadyQuestions = this.cloneQuestions(cached);
      this.quizService.applySessionQuestions(quizId, sessionReadyQuestions);
      this.syncSelectedQuizState(quizId, sessionReadyQuestions);
      return of(this.cloneQuestions(sessionReadyQuestions));
    }

    const shouldShuffle = this.quizService.isShuffleEnabled();
    const baseQuestions = this.baseQuizQuestionCache.get(quizId);

    if (Array.isArray(baseQuestions) && baseQuestions.length > 0) {
      const sessionQuestions = this.buildSessionQuestions(
        quizId,
        baseQuestions,
        shouldShuffle
      );

      this.quizQuestionCache.set(quizId, this.cloneQuestions(sessionQuestions));
      const sessionClone = this.cloneQuestions(sessionQuestions);
      this.quizService.applySessionQuestions(quizId, sessionClone);
      this.syncSelectedQuizState(quizId, sessionClone);

      return of(this.cloneQuestions(sessionClone));
    }

    return this.getQuiz(quizId).pipe(
      map((quiz) => {
        const base = this.ensureBaseQuestions(quizId, quiz);
        const sessionQuestions = this.buildSessionQuestions(
          quizId,
          base,
          shouldShuffle
        );

        this.quizQuestionCache.set(quizId, this.cloneQuestions(sessionQuestions));
        const sessionClone = this.cloneQuestions(sessionQuestions);
        this.quizService.applySessionQuestions(quizId, sessionClone);
        this.syncSelectedQuizState(quizId, sessionClone, quiz);

        return this.cloneQuestions(sessionClone);
      }),
      catchError((error: Error) => {
        console.error('[prepareQuizSession] Failed to fetch questions:', error);
        return of([]);
      })
    );
  }


  private createBaseQuestions(quiz: Quiz): QuizQuestion[] {
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    if (!questions.length) {
      return [];
    }

    return questions.map((question) => this.normalizeQuestion(question));
  }

  private buildSessionQuestions(
    quizId: string,
    baseQuestions: QuizQuestion[],
    shouldShuffle: boolean
  ): QuizQuestion[] {
    const workingSet = this.cloneQuestions(baseQuestions);

    if (shouldShuffle) {
      this.quizShuffleService.prepareShuffle(quizId, workingSet);
      const shuffled = this.quizShuffleService.buildShuffledQuestions(quizId, workingSet);
      return this.cloneQuestions(shuffled);
    }

    this.quizShuffleService.clear(quizId);
    return workingSet;
  }

  private sanitizeOptions(options: Option[] = []): Option[] {
    // ensure numeric IDs (idempotent)
    const withIds = this.quizShuffleService.assignOptionIds(options, 1);
  
    const toNum = (v: unknown): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = Number(String(v));
      return Number.isFinite(n) ? n : null;
    };
  
    return withIds.map((option, index): Option => {
      // keep value strictly numeric per Option type
      const numericValue =
        toNum(option.value) ??
        toNum((option as any).text) ??  // in case text is "3"
        (index + 1);
  
      return {
        ...option,
        value: numericValue,
        correct: option.correct === true,
        selected: option.selected === true,
        highlight: option.highlight ?? false,
        showIcon: option.showIcon ?? false,
      };
    });
  }  

  private normalizeQuestion(question: QuizQuestion): QuizQuestion {
    const sanitizedOptions = this.sanitizeOptions(question.options ?? []);
    const alignedAnswers = this.quizShuffleService.alignAnswersWithOptions(
      question.answer,
      sanitizedOptions
    );

    return {
      ...question,
      options: sanitizedOptions.map((option) => ({ ...option })),
      answer: alignedAnswers.map((option) => ({ ...option })),
      selectedOptions: Array.isArray(question.selectedOptions)
        ? question.selectedOptions.map((option) => ({ ...option }))
        : undefined,
      selectedOptionIds: Array.isArray(question.selectedOptionIds)
        ? [...question.selectedOptionIds]
        : undefined
    };
  }

  private cloneQuestions(questions: QuizQuestion[] = []): QuizQuestion[] {
    return (questions ?? []).map((question) => ({
      ...question,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({ ...option }))
        : [],
      answer: Array.isArray(question.answer)
        ? question.answer.map((answer) => ({ ...answer }))
        : undefined,
      selectedOptions: Array.isArray(question.selectedOptions)
        ? question.selectedOptions.map((option) => ({ ...option }))
        : undefined,
      selectedOptionIds: Array.isArray(question.selectedOptionIds)
        ? [...question.selectedOptionIds]
        : undefined
    }));
  }

  private cloneQuestion(question: QuizQuestion | undefined | null): QuizQuestion | null {
    if (!question) {
      return null;
    }

    return this.cloneQuestions([question])[0] ?? null;
  }

  private ensureBaseQuestions(
    quizId: string,
    quiz: Quiz | null
  ): QuizQuestion[] {
    const cached = this.baseQuizQuestionCache.get(quizId);
    if (Array.isArray(cached) && cached.length > 0) {
      return this.cloneQuestions(cached);
    }

    const normalized = (quiz?.questions ?? [])
      .map((question) => this.normalizeQuestion(question));

    const normalizedClone = this.cloneQuestions(normalized);
    this.baseQuizQuestionCache.set(quizId, this.cloneQuestions(normalizedClone));

    return normalizedClone;
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]] | null> {
    if (typeof questionIndex !== 'number' || isNaN(questionIndex)) {
      console.error(`❌ Invalid questionIndex: ${questionIndex}`);
      return of(null);
    }
    
    return this.getQuiz(quizId).pipe(
      map(quiz => {
        let questionsToUse = this.quizQuestionCache.get(quizId);

        if (!Array.isArray(questionsToUse) || questionsToUse.length === 0) {
          const base = this.ensureBaseQuestions(quizId, quiz);
          const sessionQuestions = this.buildSessionQuestions(
            quizId,
            base,
            this.quizService.isShuffleEnabled()
          );

          this.quizQuestionCache.set(quizId, this.cloneQuestions(sessionQuestions));
          questionsToUse = sessionQuestions;
        }

        if (questionIndex < 0 || !Array.isArray(questionsToUse) || questionIndex >= questionsToUse.length) {
          console.error(`Question index ${questionIndex} out of bounds`);
          return null;
        }

        const question = this.cloneQuestion(questionsToUse[questionIndex]);
        if (!question) {
          console.error(`No question found at index ${questionIndex}`);
          return null;
        }

        const options = (question.options ?? []).map((option) => ({
          ...option,
          correct: option.correct === true,
          selected: option.selected === true,
          highlight: option.highlight ?? false,
          showIcon: option.showIcon ?? false
        }));

        question.options = options.map((option) => ({ ...option }));
        question.answer = this.quizShuffleService.alignAnswersWithOptions(
          question.answer,
          options
        );

        if (options.length === 0) {
          console.warn(`No options found for question at index ${questionIndex}`);
        }

        return [
          question,
          options.map((option) => ({ ...option }))
        ] as [QuizQuestion, Option[]];
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