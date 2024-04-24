import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, ReplaySubject, Subject, throwError } from 'rxjs';
import { catchError, delay, distinctUntilChanged, filter, map, retryWhen, shareReplay, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { isEqual } from 'lodash';

import { QuestionType } from '../../shared/models/question-type.enum';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizDataService implements OnDestroy {
  quiz: Quiz;
  quizzes: Quiz[] = [];
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  quizzesSubject = new BehaviorSubject<Quiz[]>(this.quizzes);
  quizId = '';
  question: QuizQuestion | null = null;
  questionType: string;

  currentQuestionIndex = 0;
  currentQuestionIndex$ = new BehaviorSubject<number>(0);

  selectedQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedQuizSubject: BehaviorSubject<Quiz | null> =
    new BehaviorSubject<Quiz | null>(null);

  private currentQuizSubject = new BehaviorSubject<Quiz | null>(null);
  currentQuiz$ = this.currentQuizSubject.asObservable();

  currentQuestion$: QuizQuestion;
  options$: Observable<Option[]>;

  hasQuestionAndOptionsLoaded = false;
  questionAndOptionsSubject = new ReplaySubject<[QuizQuestion, Option[]]>(1);

  private quizUrl = 'assets/data/quiz.json';
  private destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private activatedRoute: ActivatedRoute
  ) {
    this.quizzes$ = new BehaviorSubject<Quiz[]>([]);
    this.selectedQuiz$ = new BehaviorSubject<Quiz | null>(this.selectedQuiz);
    this.selectedQuizSubject = new BehaviorSubject<Quiz>(null);

    this.loadQuizzesData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadQuizzesData(): void {
    this.http
      .get<Quiz[]>(this.quizUrl)
      .pipe(
        tap((quizzes: Quiz[]) => {
          this.quizzes$.next(quizzes);
          this.quizzes = quizzes;
          if (quizzes.length > 0) {
            this.selectedQuiz = quizzes[0];
            this.selectedQuiz$.next(this.selectedQuiz);
          }
        }),
        catchError((error: HttpErrorResponse) => {
          console.error('Error loading quizzes:', error);
          return [];
        })
      )
      .subscribe();
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap((quizzes) => {
        this.quizzes = quizzes;
        this.quizzesSubject.next(quizzes);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error retrieving quizzes:', error);
        return of([]);
      })
    );
  }

  isValidQuiz(quizId: string): Observable<boolean> {
    return this.http.get<Quiz>(`/api/quizzes/${quizId}`).pipe(
      map(quiz => !!quiz && quiz.questions.length > 0),
      catchError(() => of(false))
    );
  }

  setCurrentQuiz(quiz: Quiz): void {
    this.currentQuizSubject.next(quiz);
  }

  setSelectedQuiz(quiz: Quiz | null): void {
    this.selectedQuiz = quiz;
    this.selectedQuiz$.next(quiz);
    this.selectedQuiz$
      .pipe(take(1), distinctUntilChanged())
      .subscribe((selectedQuiz: Quiz) => {
        this.selectedQuizSubject.next(selectedQuiz);
      });
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

  getQuiz(quizId: string): Observable<Quiz> {
    if (!quizId) {
      throw new Error('quizId parameter is null or undefined');
    }

    return this.http.get<Quiz[]>(`${this.quizUrl}`).pipe(
      distinctUntilChanged(),
      map((response: Quiz[]) => {
        const quiz = response.find((q: Quiz) => q.quizId === quizId);

        if (!quiz) {
          throw new Error('Invalid quizId');
        }

        if (!quiz.questions || quiz.questions.length === 0) {
          throw new Error('Quiz has no questions');
        }

        return quiz;
      }),
      catchError((error: HttpErrorResponse) => {
        throw new Error('Error getting quiz\n' + error.message);
      })
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
      const question = await firstValueFrom(
        this.fetchQuizQuestionByIdAndIndex(quizId, currentQuestionIndex)
      );
      this.question = question;
    } catch (error) {
      console.error('Error setting question:', error);
    }
  }

  /* fetchQuizQuestionByIdAndIndex(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      switchMap(([question]): Observable<QuizQuestion | null> => {
        if (!question) {
          return of(null);
        }
  
        return of(question as QuizQuestion);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error getting quiz question:', error);
        const customError = new Error('An error occurred while fetching data.');
        return throwError(() => customError);
      }),
      distinctUntilChanged()
    ) as Observable<QuizQuestion | null>;
  } */

  /* fetchQuizQuestionByIdAndIndex(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      switchMap((result): Observable<QuizQuestion | null> => {
        // Ensure 'result' is an array and has elements before attempting to destructure
        if (!Array.isArray(result) || result.length === 0 || !result[0]) {
          console.error('Expected an array with elements from getQuestionAndOptions:', result);
          return of(null);
        }
  
        const [question] = result;
        return of(question as QuizQuestion);
      }),
      catchError((error: HttpErrorResponse) => {
        console.error('Error getting quiz question:', error);
        const customError = new Error('An error occurred while fetching data.');
        return throwError(() => customError);
      }),
      distinctUntilChanged()
    ) as Observable<QuizQuestion | null>;
  } */

  fetchQuizQuestionByIdAndIndex(quizId: string, questionIndex: number): Observable<QuizQuestion | null> {
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

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(
      map((quiz: Quiz) => {
        // clone the questions array to avoid unintended mutations
        const questions = quiz.questions.map((question) => ({ ...question }));
        return questions;
      }),
      distinctUntilChanged((prevQuestions, currQuestions) => {
        return isEqual(prevQuestions, currQuestions);
      })
    );
  }

  getOptions(quizId: string, questionIndex: number): Observable<Option[]> {
    return this.fetchQuizQuestionByIdAndIndex(quizId, questionIndex).pipe(
      map((question) => {
        if (!question) {
          console.error('Question is null or undefined in getOptions');
          throw new Error('Question is null or undefined in getOptions');
        }
        const options = question?.options;
        if (!options || options?.length === 0) {
          console.error('Invalid question options');
          throw new Error('Invalid question options');
        }
        return options;
      }),
      distinctUntilChanged(),
      catchError((error: HttpErrorResponse) => {
        console.error('Error fetching question:', error);
        throw error; // rethrow the error to propagate it to the caller
      })
    );
  }

  /* getQuestionAndOptions(
    quizId: string,
    questionIndex: number
  ): Observable<[QuizQuestion, Option[]]> {
    if (
      this.hasQuestionAndOptionsLoaded &&
      this.currentQuestionIndex === questionIndex
    ) {
      return this.questionAndOptionsSubject
        .asObservable()
        .pipe(distinctUntilChanged());
    }

    const quiz$ = this.fetchQuizDataFromAPI();
    const currentQuestion$ = this.getQuizQuestionByIdAndIndex(
      quiz$, quizId, questionIndex
    ).pipe(
      shareReplay({ refCount: true, bufferSize: 1 })
    ) as Observable<QuizQuestion>;
    const options$: Observable<Option[]> = this.getQuestionOptions(currentQuestion$).pipe(
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.processQuestionAndOptions(
      currentQuestion$,
      options$,
      questionIndex
    ).subscribe((questionAndOptions) => {
      this.questionAndOptionsSubject.next(questionAndOptions);
    });

    return this.questionAndOptionsSubject
      .asObservable()
      .pipe(distinctUntilChanged());
  } */

  /* getQuestionAndOptions(
    quizId: string,
    questionIndex: number
): Observable<[QuizQuestion, Option[]]> {
    if (
        this.hasQuestionAndOptionsLoaded &&
        this.currentQuestionIndex === questionIndex
    ) {
        return this.questionAndOptionsSubject.asObservable().pipe(distinctUntilChanged());
    }

    // Assuming fetchQuizDataFromAPI() is required to fetch some data relevant for obtaining the quiz question
    // and that it outputs an observable which should ultimately resolve to provide quiz data:
    return this.fetchQuizDataFromAPI().pipe(
        switchMap(quizData => {
            // Assuming we get something from quizData that is relevant for the next steps.
            // You need to adjust this part based on what quizData contains and what you need.
            const currentQuestion$ = this.getQuizQuestionByIdAndIndex(quizId, questionIndex).pipe(
                shareReplay({refCount: true, bufferSize: 1})
            );
            const options$ = this.getQuestionOptions(currentQuestion$).pipe(
                shareReplay({refCount: true, bufferSize: 1})
            );

            return this.processQuestionAndOptions(currentQuestion$, options$, questionIndex);
        }),
        tap(questionAndOptions => {
            this.questionAndOptionsSubject.next(questionAndOptions);
        }),
        catchError(error => {
            console.error('Error in processing quiz question and options:', error);
            return of(null);
        }),
        distinctUntilChanged()
    );
  } */

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]] | null> {
    // Check if the data has already been loaded and the index matches the current question index
    if (this.hasQuestionAndOptionsLoaded && this.currentQuestionIndex === questionIndex) {
      return this.questionAndOptionsSubject.asObservable().pipe(distinctUntilChanged());
    }
  
    // Fetch new data from the API
    return this.fetchQuizDataFromAPI().pipe(
      switchMap(quizData => {
        if (!quizData) {
          console.error('Quiz data is empty or null');
          return of(null);
        }
        
        const quiz = quizData.find(quiz => quiz.quizId === quizId);
        if (!quiz) {
          console.error(`No quiz found for the quiz ID: ${quizId}`);
          return of(null);
        }
        
        // Ensure questionIndex is a number and within bounds
        questionIndex = (typeof questionIndex === 'number' && questionIndex >= 0) ? questionIndex : 0;
        if (questionIndex >= quiz.questions.length) {
          console.error(`Index ${questionIndex} out of bounds for quiz ID: ${quizId}`);
          return of(null);
        }
        
        const currentQuestion = quiz.questions[questionIndex];
        if (!currentQuestion) {
          console.error(`No valid question found at index ${questionIndex} for quiz ID: ${quizId}`);
          return of(null);
        }
    
        const options = currentQuestion.options;
        if (!options || options.length === 0) {
          console.error(`No options available for the question at index ${questionIndex} for quiz ID: ${quizId}`);
          return of(null);
        }
        
        return of([currentQuestion, options] as [QuizQuestion, Option[]]);
      }),
      tap(questionAndOptions => {
        if (questionAndOptions) {
          this.questionAndOptionsSubject.next(questionAndOptions);
          this.hasQuestionAndOptionsLoaded = true;
          this.currentQuestionIndex = questionIndex;
        }
      }),
      catchError(error => {
        console.error('Error in processing quiz question and options:', error);
        return of(null);
      }),
      distinctUntilChanged()
    );
  }
  
  fetchQuizDataFromAPI(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError((error: HttpErrorResponse) => {
        console.log('Error:', error);
        return of(null);
      }),
      retryWhen((errors: any) => errors.pipe(delay(1000), take(3))),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /* getQuizQuestionByIdAndIndex(
    quiz$: Observable<Quiz[]>,
    quizId: string,
    questionIndex: number = 0
  ): Observable<QuizQuestion> {
    const quizId$ = this.activatedRoute.params.pipe(
      map((params) => params.quizId),
      filter((quizId) => !!quizId),
      take(1)
    );

    return quizId$.pipe(
      switchMap((id) => {
        return quiz$.pipe(
          map((quizzes) => {
            return quizzes.find((q: Quiz) => q.quizId === id);
          }),
          take(1),
          switchMap((quiz) => {
            return this.getQuestionFromQuiz(quiz, questionIndex);
          })
        );
      }),
      catchError((error: HttpErrorResponse) => {
        console.log('Error:', error);
        return of(null);
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  } */

  getQuizQuestionByIdAndIndex(quiz$: Observable<Quiz[]>, quizId: string, questionIndex: number): Observable<QuizQuestion | null> {
    return quiz$.pipe(
      map(quizzes => quizzes.find(quiz => quiz.quizId === quizId)),
      switchMap(quiz => {
        if (!quiz || !quiz.questions || quiz.questions.length <= questionIndex) {
          console.error('Quiz data is missing or the index is out of range.');
          return of(null);
        }
        return of(quiz.questions[questionIndex]);
      }),
      catchError(error => {
        console.error('Error fetching quiz question:', error);
        return of(null);
      })
    );
  }  

  getQuestionFromQuiz(
    quiz: Quiz,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    if (!quiz) {
      throw new Error('Selected quiz not found');
    }

    if (!quiz.questions || quiz.questions.length === 0) {
      throw new Error('Selected quiz has no questions');
    }

    const questions = quiz.questions;

    if (questionIndex >= questions?.length) {
      throw new Error('Question index out of bounds');
    }

    const question = questions[questionIndex];
    const options = question?.options;

    if (!question || question?.options === undefined) {
      throw new Error('Question not found');
    }

    if (!options || options?.length === 0) {
      throw new Error('Question has no options');
    }

    return of(question);
  }

  getQuestionOptions(
    currentQuestion$: Observable<QuizQuestion>
  ): Observable<Option[]> {
    return currentQuestion$.pipe(
      filter((question: QuizQuestion) => !!question),
      map((question: QuizQuestion) => {
        if (!question) {
          throw new Error('Question object is null');
        }

        const options = question?.options;
        if (
          !options ||
          !Array.isArray(options) ||
          (options && options?.length === 0) ||
          (options && typeof options[Symbol.iterator] !== 'function')
        ) {
          throw new Error('Question options not found');
        }

        return options;
      }),
      catchError((error: HttpErrorResponse) => {
        console.log('Error:', error);
        return of(null);
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  processQuestionAndOptions(
    currentQuestion$: Observable<QuizQuestion>,
    options$: Observable<Option[]>,
    questionIndex: number
  ): Observable<[QuizQuestion, Option[]] | null> {
    return combineLatest([currentQuestion$, options$]).pipe(
      filter(([question, options]) => !!question && !!options),
      map(([question, options]): [QuizQuestion, Option[]] => {
        if (!question || question.options === undefined) {
          throw new Error('Question not found');
        }
  
        if (questionIndex >= question.options.length) {
          throw new Error('Question index out of bounds');
        }
  
        return [question, options];
      }),
      catchError((error: HttpErrorResponse) => {
        console.log('Error:', error);
        return of(null);
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
  
  setQuestionType(question: QuizQuestion): void {
    const numCorrectAnswers = question.options.filter((option) => option.correct).length;
    question.type = numCorrectAnswers > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
    this.questionType = question.type;
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error(`Error submitting quiz ${quiz.quizId}`, error);
        throw new Error(`Error submitting quiz ${quiz.quizId}`);
      }),
      distinctUntilChanged()
    );
  }
}
