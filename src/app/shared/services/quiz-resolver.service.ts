import { Injectable } from '@angular/core';
import { Resolve, ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { EMPTY, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { Quiz } from '../../shared/models/Quiz.model';
import { QuizDataService } from './quizdata.service';

@Injectable({ providedIn: 'root' })
export class QuizResolverService implements Resolve<Quiz | null> {
  constructor(private quizDataService: QuizDataService, private router: Router) {}

  /* resolve(route: ActivatedRouteSnapshot): Observable<Quiz | null> {
    const quizId = route.params['quizId'];
    if (!quizId) {
      console.error('Quiz ID is missing in the route parameters.');
      return of(null);
    }

    return this.quizDataService.getQuizzes().pipe(
      map(quizzes => {
        const quiz = quizzes.find(q => q.quizId === quizId);
        if (!quiz) {
          console.error(`No quiz found with ID: ${quizId}`);
          return null;
        }
        if (!quiz.questions || quiz.questions.length === 0) {
          console.error('Quiz has no questions:', quiz);
          return null;
        }
        return quiz;
      }),
      catchError(error => {
        console.error(`Error resolving quiz data for ID ${quizId}:`, error);
        return of(null);
      })
    );
  } */

  /* resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<Quiz> {
    const quizId = route.paramMap.get('quizId');
    console.log(`Resolving data for quizId: ${quizId}`);
    return this.quizDataService.getQuiz(quizId);
  } */

  /* resolve(route: ActivatedRouteSnapshot): Observable<any> {
    const quizId = route.params['quizId'];
    console.log('Resolving data for quizId:', quizId);
    return this.quizDataService.getQuiz(quizId).pipe(
      map(quiz => {
        if (!quiz) {
          console.error(`Quiz with ID ${quizId} not found.`);
          throw new Error(`Quiz with ID ${quizId} not found.`);
        }
        return quiz;
      }),
      catchError(error => {
        console.error('Error in resolver:', error);
        return of(null); // Ensuring the navigation can proceed if the quiz is not found
      })
    );
  } */

  resolve(route: ActivatedRouteSnapshot): Observable<Quiz> {
    const quizId = route.params['quizId'];
    console.log('Resolving data for quizId:', quizId);
    return this.quizDataService.getQuiz(quizId).pipe(
      tap(quiz => {
        if (!quiz) {
          console.error(`Quiz with ID ${quizId} not found.`);
          this.router.navigate(['/select']);
          throw new Error(`Quiz with ID ${quizId} not found.`);
        }
        console.log('QuizResolverService: Fetched quiz data:', quiz);
      }),
      map(quiz => {
        if (!quiz) {
          throw new Error('Quiz not found');
        }
        return quiz;
      }),
      catchError(error => {
        console.error('QuizResolverService: Error fetching quiz data:', error);
        this.router.navigate(['/select']);
        return EMPTY;
      })
    );
  }
}