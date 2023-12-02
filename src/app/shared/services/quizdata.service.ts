import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  ReplaySubject,
  Subject,
  throwError,
} from 'rxjs';
import {
  catchError,
  delay,
  distinctUntilChanged,
  filter,
  map,
  retryWhen,
  shareReplay,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';
import { isEqual } from 'lodash';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false',
}

@Injectable({
  providedIn: 'root',
})
export class QuizDataService implements OnDestroy {
  quiz: Quiz;
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  quizzes: Quiz[] = [];
  quizzesSubject = new BehaviorSubject<Quiz[]>(this.quizzes);
  quizId = '';
  currentQuizId = '';
  question: QuizQuestion | null = null;
  questionAndOptions: [QuizQuestion, Option[]] | null = null;
  currentQuestionAndOptions: [QuizQuestion, Option[]];

  currentQuestionIndex = 0;
  currentQuestionIndex$ = new BehaviorSubject<number>(0);

  selectedQuiz: Quiz;
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);
  selectedQuizSubject: BehaviorSubject<Quiz | null> =
    new BehaviorSubject<Quiz | null>(null);

  currentQuestion$: QuizQuestion;
  options$: Option[];

  previousQuestionTextSubject = new BehaviorSubject<string>('');

  hasQuestionAndOptionsLoaded = false;
  questionAndOptionsSubject = new ReplaySubject<[QuizQuestion, Option[]]>(1);

  currentQuestionSubject = new BehaviorSubject<QuizQuestion>(null);
  currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$ = this.currentOptionsSubject.asObservable();

  currentQuestionAndOptions$ = combineLatest([
    this.currentQuestionSubject.asObservable(),
    this.currentOptionsSubject.asObservable(),
  ]).pipe(
    map(([currentQuestion, currentOptions]) => {
      return {
        question: currentQuestion,
        options: currentOptions,
      };
    })
  );

  private quizUrl = 'assets/data/quiz.json';
  private destroy$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private activatedRoute: ActivatedRoute
  ) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz | null>(this.selectedQuiz);
    this.selectedQuizSubject = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = new BehaviorSubject<Quiz[]>([]);

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
        tap((quizzes) => {
          this.quizzes$.next(quizzes);
          this.quizzes = quizzes;
          if (quizzes.length > 0) {
            this.selectedQuiz = quizzes[0];
            this.selectedQuiz$.next(this.selectedQuiz);
          }
        }),
        catchError((error) => {
          console.error('Error loading quizzes:', error);
          return [];
        })
      )
      .subscribe();
  }

  getQuizData(quizId: string): Observable<QuizQuestion[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes) => {
        const selectedQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
        return selectedQuiz ? selectedQuiz.questions : [];
      }),
      catchError((error) => {
        console.error('Error fetching quiz data:', error);
        return of([]);
      })
    );
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      tap((quizzes) => {
        this.quizzes = quizzes;
        this.quizzesSubject.next(quizzes);
      }),
      catchError((error) => {
        console.error('Error retrieving quizzes:', error);
        return of([]);
      })
    );
  }

  setSelectedQuiz(quiz: Quiz | null): void {
    this.selectedQuiz = quiz;
    this.selectedQuiz$.next(quiz);
    this.selectedQuiz$
      .pipe(take(1), distinctUntilChanged())
      .subscribe((selectedQuiz) => {
        this.selectedQuizSubject.next(selectedQuiz);
      });
  }

  setSelectedQuizById(quizId: string): Observable<void> {
    return this.getQuizzes().pipe(
      switchMap((quizzes) => {
        this.quizzes = quizzes;
        const quiz = this.quizzes.find((q) => q.quizId === quizId);
        if (!quiz) {
          console.error('Selected quiz not found');
          return throwError('Selected quiz not found');
        }
        this.setSelectedQuiz(quiz);
        return of(undefined);
      }),
      catchError((error) => {
        console.error('Error retrieving quizzes:', error);
        return throwError('Error retrieving quizzes');
      }),
      takeUntil(this.destroy$)
    );
  }

  getSelectedQuiz(): Observable<Quiz | null> {
    return this.selectedQuiz$.pipe(
      distinctUntilChanged(),
      filter((selectedQuiz) => !!selectedQuiz),
      take(1),
      catchError(() => of(null))
    );
  }

  getQuiz(quizId: string): Observable<Quiz> {
    if (!quizId) {
      return throwError('quizId parameter is null or undefined');
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
        return throwError('Error getting quiz\n' + error.message);
      })
    );
  }

  getQuizById(quizId: string): Observable<Quiz> {
    if (!quizId) {
      return throwError(new Error(`Quiz ID is undefined`));
    }

    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId)),
      switchMap((quiz) => {
        if (!quiz) {
          return throwError(new Error(`Quiz with ID ${quizId} not found`));
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
          return throwError(new Error(`Quiz with ID ${quizId} not found`));
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
      catchError((error) => {
        console.error('Error getting explanation texts:', error);
        return of([]);
      })
    );
  }

  async asyncOperationToSetQuestion(quizId: string, currentQuestionIndex: number): Promise<void> {
    try {
      // Simulate an asynchronous operation, e.g., fetching data from a service
      const question = await this.getQuestion(quizId, currentQuestionIndex).toPromise();
      this.setQuestion(question);
    } catch (error) {
      console.error('Error setting question:', error);
    }
  }

  setQuestion(question: QuizQuestion | null): void {
    this.question = question;
  }

  getQuestion(
    quizId: string,
    questionIndex: number
  ): Observable<QuizQuestion | null> {
    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      switchMap(([question, options]) => {
        if (!question) {
          return of(null); // Question not found
        }

        return of(question);
      }),
      catchError((error) => {
        console.error('Error getting quiz question:', error);
        return throwError(error);
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
    return this.getQuestion(quizId, questionIndex).pipe(
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
      catchError((error) => {
        console.error('Error fetching question:', error);
        throw error; // rethrow the error to propagate it to the caller
      })
    );
  }

  getQuestionAndOptions(
    quizId: string,
    questionIndex: number
  ): Observable<[QuizQuestion, Option[]]> {
    console.log(
      `getQuestionAndOptions called with quizId: ${quizId} and questionIndex: ${questionIndex}`
    );
    console.log('getQuestionAndOptions called');
    if (
      this.hasQuestionAndOptionsLoaded &&
      this.currentQuestionIndex === questionIndex
    ) {
      return this.questionAndOptionsSubject
        .asObservable()
        .pipe(distinctUntilChanged());
    }

    const quiz$ = this.loadQuizData();
    const currentQuestion$ = this.getQuizQuestionByIdAndIndex(
      quiz$,
      quizId,
      questionIndex
    ).pipe(shareReplay({ refCount: true, bufferSize: 1 }));
    const options$ = this.getQuestionOptions(currentQuestion$).pipe(
      shareReplay({ refCount: true, bufferSize: 1 })
    );

    this.processQuestionAndOptions(
      currentQuestion$,
      options$,
      questionIndex
    ).subscribe((questionAndOptions) => {
      this.questionAndOptionsSubject.next(questionAndOptions);
    });

    console.log('getQuestionAndOptions completed');

    return this.questionAndOptionsSubject
      .asObservable()
      .pipe(distinctUntilChanged());
  }

  loadQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError((err) => {
        console.log('Error:', err);
        return of(null);
      }),
      retryWhen((errors) => errors.pipe(delay(1000), take(3))),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getQuizQuestionByIdAndIndex(
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
      catchError((err) => {
        console.log('Error:', err);
        return of(null);
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getQuestionFromQuiz(
    quiz: Quiz,
    questionIndex: number
  ): Observable<QuizQuestion> {
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
      filter((question) => !!question),
      map((question) => {
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
      catchError((err) => {
        console.log('Error:', err);
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
  ): Observable<[QuizQuestion, Option[]]> {
    return combineLatest([currentQuestion$, options$]).pipe(
      filter(([question, options]) => !!question && !!options),
      map(([question, options]) => {
        if (!question || question?.options === undefined) {
          throw new Error('Question not found');
        }

        if (questionIndex >= question?.options?.length) {
          throw new Error('Question index out of bounds');
        }

        return [question, options];
      }),
      catchError((err) => {
        console.log('Error:', err);
        return of(null);
      }),
      distinctUntilChanged(
        (prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)
      ),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  selectQuiz(quiz: Quiz): void {
    this.selectedQuizSubject.next(quiz);
  }

  getCurrentQuestionIndex(): Observable<number> {
    return this.currentQuestionIndex$
      .asObservable()
      .pipe(distinctUntilChanged());
  }

  setQuestionType(question: QuizQuestion): void {
    const numCorrectAnswers = question.options.filter((option) => option.correct).length;
  
    question.type = numCorrectAnswers > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
  }  

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    this.currentQuestionIndex$.next(this.currentQuestionIndex);
  }

  setPreviousQuestionText(text: string): void {
    this.previousQuestionTextSubject.next(text);
  }

  getPreviousQuestionText(): Observable<string> {
    return this.previousQuestionTextSubject.asObservable();
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/results/${quiz.quizId}`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error) => {
        console.error(`Error submitting quiz ${quiz.quizId}`, error);
        return throwError(error);
      }),
      distinctUntilChanged()
    );
  }
}
