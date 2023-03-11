import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map, mergeMap, switchMap, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';

@Injectable({
  providedIn: 'root',
})
export class QuizDataService {
  quiz: Quiz;
  quizzes$: BehaviorSubject<Quiz[]> = new BehaviorSubject<Quiz[]>([]);
  currentQuestionIndex: number = 1;
  currentQuestionIndex$ = new BehaviorSubject<number>(0);

  selectedQuizIdSubject = new BehaviorSubject<string>(null);
  quizIdSubject = new Subject<string>();
  selectedQuiz$ = new BehaviorSubject<Quiz | null>(null);
  selectedQuizId$ = this.selectedQuizIdSubject.asObservable();
  selectedQuizSource = new BehaviorSubject<Quiz>({});
  selectedQuizSubject: BehaviorSubject<Quiz | null> = new BehaviorSubject<Quiz | null>(null);

  private quizUrl = 'assets/data/quiz.json';

  constructor(private http: HttpClient) {
    this.selectedQuiz$ = new BehaviorSubject<Quiz>(null);
    this.quizzes$ = new BehaviorSubject<Quiz[]>([]);
    this.http
      .get<Quiz[]>(this.quizUrl)
      .subscribe(
        (quizzes) => this.quizzes$.next(quizzes),
        (error) => console.error(error)
      );
  }

  getQuizzes(): Observable<Quiz[]> {
    return this.http.get<Quiz[]>(this.quizUrl);
  }

  getQuizById(quizId: string): Observable<Quiz> {
    return this.quizzes$.pipe(
      map((quizzes) => quizzes.find((quiz) => quiz.quizId === quizId))
    );
  }

  get selectedQuiz(): Quiz {
    return this.selectedQuiz$.getValue();
  }

  setSelectedQuiz(quizId: string): void {
    this.getQuiz(quizId).subscribe(quiz => {
      if (quiz) {
        this.selectedQuizSubject.next(quiz);
      }
    });
  }

  getSelectedQuiz(): Observable<Quiz> {
    return this.selectedQuizSubject.asObservable();
  }

  /* getSelectedQuiz(): Observable<Quiz> {
    console.log('getSelectedQuiz selectedQuizSubject value:', this.selectedQuizSubject.value);
    console.log('getSelectedQuiz selectedQuizSubject asObservable:', this.selectedQuizSubject.asObservable());
    console.log('getSelectedQuiz selectedQuiz:', this.selectedQuiz);
  
    return this.selectedQuizSubject.asObservable().pipe(
      switchMap((selectedQuiz) => {
        if (selectedQuiz) {
          console.log('getSelectedQuiz returning selectedQuiz:', selectedQuiz);
          return of(selectedQuiz);
        } else {
          return this.getQuizzes().pipe(
            map((quizzes: Quiz[]) => quizzes[0])
          );
        }
      })
    );
  } */

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
  
  selectQuiz(quiz: Quiz): void {
    this.selectedQuizSubject.next(quiz);
  }

  getCurrentQuestionIndex(): Observable<number> {
    return this.currentQuestionIndex$.asObservable();
  }

  setCurrentQuestionIndex(index: number): void {
    this.currentQuestionIndex = index;
    console.log('Current question index:', this.currentQuestionIndex);
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
