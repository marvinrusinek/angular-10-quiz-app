import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

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

  setSelectedQuiz(quiz: Quiz) {
    console.log('Setting selected quiz:', quiz);
    this.selectedQuiz$.next(quiz);
  }

  getSelectedQuiz(): Observable<Quiz> {
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
