import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  retryWhen,
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

  currentQuestionIndex: number = 1;
  currentQuestionIndex$ = new BehaviorSubject<number>(0);

  selectedQuiz: Quiz;
  selectedQuizSubject = new BehaviorSubject<Quiz>(null);

  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  selectedQuiz$: BehaviorSubject<Quiz> = new BehaviorSubject<Quiz>(null);

  private quizUrl = 'assets/data/quiz.json';

  constructor(private http: HttpClient) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz | null>(this.selectedQuiz);
    this.selectedQuizSubject = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = new BehaviorSubject<Quiz[]>([]);

    this.http.get<Quiz[]>(this.quizUrl).subscribe(
      (quizzes) => this.quizzes$.next(quizzes),
      (error) => console.error(error)
    );
  }

  ngOnInit(): void {
    this.getQuizzes().subscribe((quizzes) => {
      this.quizzes = quizzes;
      if (this.quizzes.length > 0) {
        this.selectedQuiz = this.quizzes[0];
        this.selectedQuiz$.next(this.selectedQuiz);
      }
    });
  }

  getQuizData(): Observable<QuizQuestion[]> {
    return this.http
      .get<Quiz[]>(this.quizUrl)
      .pipe(map((quizData) => quizData.questions));
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
      tap((selectedQuiz) =>
        console.log('selectedQuiz$ emitted:', selectedQuiz)
      ),
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

    const apiUrl = `${this.quizUrl}`;

    return this.http.get<Quiz[]>(apiUrl).pipe(
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
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes: Quiz[]) => quizzes.find((quiz) => quiz.quizId === quizId)),
      tap((quiz) => {
        if (!quiz) {
          throw new Error(`Quiz with ID ${quizId} not found`);
        }
      })
    );
  }

  getQuestion(quizId: string, questionIndex: number): Observable<QuizQuestion> {
    return this.getQuestionAndOptions(quizId, questionIndex).pipe(
      map(([question, options]) => question)
    );
  }

  getQuestionsForQuiz(quizId: string): Observable<QuizQuestion[]> {
    return this.getQuiz(quizId).pipe(map((quiz: Quiz) => quiz.questions));
  }

  getOptions(quizId: string, questionIndex: number): Observable<Option[]> {
    return this.getQuestion(quizId, questionIndex).pipe(
      map((question) => {
        const options = question.options;
        if (!options || options.length === 0) {
          console.error('Invalid question options>>');
          throw new Error('Invalid question options');
        }
        return options;
      })
    );
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): Observable<[QuizQuestion, Option[]]> {
    console.log(`getQuestionAndOptions called with quizId: ${quizId} and questionIndex: ${questionIndex}`);
    // console.log('getQuestionAndOptions called with quizId:', quizId, 'and questionIndex:', questionIndex);
    return this.http.get<Quiz[]>(this.quizUrl).pipe(
      map((quizzes: Quiz[]) => {
        const quiz = quizzes.find(q => q.quizId === quizId);
        if (!quiz) {
          throw new Error('Selected quiz not found');
        }

        if (!quiz.questions || quiz.questions.length === 0) {
          throw new Error('Selected quiz has no questions');
        }

        const question = quiz.questions[questionIndex];
        if (!question) {
          throw new Error('Question not found');
        }

        const options = question.options;
        if (!options || !Array.isArray(options) || options.length === 0 || typeof options[Symbol.iterator] !== 'function') {
          throw new Error('Question options not found');
        }

        const result = [question, options] as [QuizQuestion, Option[]];
        return result;
      }),
      catchError(err => {
        console.log('Error:', err);
        return of(null);
      }),
      retryWhen((errors) => errors.pipe(delay(1000), take(3))),
      distinctUntilChanged((prev, curr) => prev[0].questionId === curr[0].questionId && prev[1].length === curr[1].length)
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
