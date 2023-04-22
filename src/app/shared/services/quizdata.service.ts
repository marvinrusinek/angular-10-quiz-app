import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  Observable,
  of,
  ReplaySubject,
  throwError,
} from 'rxjs';
import {
  catchError,
  delay,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  retryWhen,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService implements OnInit {
  quiz: Quiz;
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  quizzes: Quiz[] = [];
  quizzesSubject = new BehaviorSubject<Quiz[]>(this.quizzes);
  quizId: string = '';
  currentQuizId: string = '';
  questionAndOptions: [QuizQuestion, Option[]] | null = null;

  currentQuestionIndex: number = 1;
  currentQuestionIndex$ = new BehaviorSubject<number>(0);

  selectedQuiz: Quiz;
  selectedQuizSubject = new BehaviorSubject<Quiz>(null);

  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);

  currentQuestion$: QuizQuestion;
  options$: Option[];

  hasQuestionAndOptionsLoaded = false;
  questionAndOptionsSubject = new ReplaySubject<[QuizQuestion, Option[]]>(1);

  private quizUrl = 'assets/data/quiz.json';

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
        options: currentOptions
      };
    })
  );

  constructor(
    private http: HttpClient,
    private activatedRoute: ActivatedRoute
  ) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz | null>(this.selectedQuiz);
    this.selectedQuizSubject = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = new BehaviorSubject<Quiz[]>([]);

    this.loadQuizzesData();
  }

  loadQuizzesData(): void {
    this.http.get<Quiz[]>(this.quizUrl).subscribe(
      (quizzes) => {
        this.quizzes$.next(quizzes);
        this.quizzes = quizzes;
        if (this.quizzes.length > 0) {
          this.selectedQuiz = this.quizzes[0];
          this.selectedQuiz$.next(this.selectedQuiz);
        }
      },
      (error) => console.error(error)
    );
  }

  getQuizData(quizId: string): Observable<QuizQuestion[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes) => {
        const selectedQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
        return selectedQuiz.questions;
      })
    );
  }

  getQuizzes(): Observable<Quiz[]> {
    this.http.get<Quiz[]>(this.quizUrl).subscribe((quizzes) => {
      this.quizzes = quizzes;
      this.quizzesSubject.next(quizzes);
    });
    return this.quizzesSubject.asObservable();
  }

  setSelectedQuiz(quiz: Quiz | null): void {
    this.selectedQuiz = quiz;
    this.selectedQuiz$.next(quiz);
    this.selectedQuiz$.pipe(take(1)).subscribe((selectedQuiz) => {
      this.selectedQuizSubject.next(selectedQuiz);
    });
  }

  getSelectedQuiz(): Observable<Quiz | null> {
    return this.selectedQuiz$.pipe(
      filter((selectedQuiz) => !!selectedQuiz),
      take(1),
      switchMap((selectedQuiz) => {
        if (selectedQuiz) {
          return of(selectedQuiz);
        } else {
          return this.selectedQuizSubject.asObservable().pipe(
            tap((selectedQuiz) =>
              console.log('selectedQuizSubject emitted:', selectedQuiz)
            ),
            filter((selectedQuiz) => !!selectedQuiz),
            take(1),
            catchError(() => of(null))
          );
        }
      })
    );
  }

  getQuiz(quizId: string): Observable<Quiz> {
    if (!quizId) {
      return throwError('quizId parameter is null or undefined');
    }

    return this.http.get<Quiz[]>(`${this.quizUrl}`).pipe(
      mergeMap((response: Quiz[]) => {
        const quiz = response.find((q: Quiz) => q.quizId === quizId);

        if (!quiz) {
          throw new Error('Invalid quizId');
        }

        if (!quiz.questions || quiz.questions.length === 0) {
          throw new Error('Quiz has no questions');
        }

        return of(quiz);
      }),
      catchError((error: HttpErrorResponse) => {
        return throwError('Error getting quiz\n' + error.message);
      })
    );
  }

  getQuizById(quizId: string): Observable<Quiz> {
    if (!quizId) {
      throw new Error(`Quiz ID is undefined`);
    }
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId)),
      tap((quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
      }),
      shareReplay()
    );
  }  

  getQuestion(quizId: string, questionIndex: number): Observable<QuizQuestion> {
    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      map(([question, options]) => question),
      catchError((error) => {
        console.error('Error getting quiz question:', error);
        return throwError(error);
      })
    );
  }

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    console.log("GQFQ");
    return this.getQuiz(quizId).pipe(map((quiz: Quiz) => quiz.questions));
  }

  getOptions(quizId: string, questionIndex: number): Observable<Option[]> {
    return this.getQuestion(quizId, questionIndex).pipe(
      map((question) => {
        if (!question) {
          console.error('Question is null or undefined');
          throw new Error('Question is null or undefined');
        }
        const options = question?.options;
        if (!options || options?.length === 0) {
          console.error('Invalid question options');
          throw new Error('Invalid question options');
        }
        return options;
      }),
      catchError((error) => {
        console.error('Error fetching question:', error);
        throw error; // Rethrow the error to propagate it to the caller
      })
    );
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]]> {
    console.log(`getQuestionAndOptions called with quizId: ${quizId} and questionIndex: ${questionIndex}`);
    console.log('getQuestionAndOptions called');
    if (this.hasQuestionAndOptionsLoaded && this.currentQuestionIndex === questionIndex) {
      return this.questionAndOptionsSubject.asObservable();
    }
  
    const quiz$ = this.loadQuizData();
    const currentQuestion$ = this.getQuizQuestionByIdAndIndex(quiz$, quizId, questionIndex).pipe(shareReplay({ refCount: true, bufferSize: 1 }));
    const options$ = this.getQuestionOptions(currentQuestion$).pipe(shareReplay({ refCount: true, bufferSize: 1 }));
    
    this.processQuestionAndOptions(currentQuestion$, options$, questionIndex).subscribe((questionAndOptions) => {
      this.questionAndOptionsSubject.next(questionAndOptions);
    });

    console.log('getQuestionAndOptions completed');
  
    return this.questionAndOptionsSubject.asObservable();
  }

  loadQuizData(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      catchError((err) => {
        console.log('Error:', err);
        return of(null);
      }),
      retryWhen((errors) => errors.pipe(delay(1000), take(3))),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  getQuizQuestionByIdAndIndex(quiz$: Observable<Quiz[]>, quizId: string, questionIndex: number = 0): Observable<QuizQuestion> {
    const quizId$ = this.activatedRoute.params.pipe(
      map((params) => params.quizId),
      filter((quizId) => !!quizId),
      take(1)
    );
  
    return quizId$.pipe(
      switchMap((id) => {
        return quiz$.pipe(
          map((quizzes) => {
            return quizzes.find((q: Quiz) => q.quizId === id)
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
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      shareReplay({ bufferSize: 1, refCount: true })
    );     
  } 

  getQuestionFromQuiz(quiz: Quiz, questionIndex: number): Observable<QuizQuestion> {
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
    
  getQuestionOptions(currentQuestion$: Observable<QuizQuestion>): Observable<Option[]> {
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
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  processQuestionAndOptions(currentQuestion$: Observable<QuizQuestion>, options$: Observable<Option[]>, questionIndex: number): Observable<[QuizQuestion, Option[]]> {
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
    return this.currentQuestionIndex$.asObservable();
  }

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    this.currentQuestionIndex$.next(this.currentQuestionIndex);
  }

  submitQuiz(quiz: Quiz): Observable<any> {
    const submitUrl = `${this.quizUrl}/quizzes/${quiz.quizId}/submit`;
    return this.http.post(submitUrl, quiz).pipe(
      catchError((error) => {
        console.error(`Error submitting quiz ${quiz.quizId}`, error);
        return throwError(error);
      })
    );
  }
}
