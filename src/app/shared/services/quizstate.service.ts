import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, throwError } from 'rxjs/operators';

import { QuestionState } from '../../shared/models/QuestionState.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root'
})
export class QuizStateService { 
  currentQuestion: BehaviorSubject<QuizQuestion | null>
    = new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion> = this.currentQuestionSubject.asObservable();

  currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSubject.asObservable();

  private resetQuizSubject = new Subject<void>();
  resetQuiz$ = this.resetQuizSubject.asObservable();

  private correctAnswersTextSource = new BehaviorSubject<string>('Default Text');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private questionStates: Map<number, QuestionState> = new Map();
  private quizQuestionCreated = false;

  constructor() {
    this.questionStates = new Map<number, QuestionState>();
  }

  saveState(quizId: string, state: any): void {
    localStorage.setItem(`quizState_${quizId}`, JSON.stringify(state));
  }

  getStoredState(quizId: string): any {
    const stateJSON = localStorage.getItem(`quizState_${quizId}`);
    return stateJSON ? JSON.parse(stateJSON) : null;
  }

  // Method to get the state of a question by its ID
  getQuestionState(questionId: number): QuestionState {
    console.log(`Getting state for questionId ${questionId}`);
    console.log(`Current question states:`, Array.from(this.questionStates.entries()));
    let state = this.questionStates.get(questionId);
    if (!state) {
      state = this.createDefaultQuestionState();
      this.questionStates.set(questionId, state);
    }
    return state;
  }
  
  // Method to set or update the state for a question
  setQuestionState(questionId: number, state: QuestionState): void {
    console.log(`Setting state for questionId ${questionId}:`, state);
    this.questionStates.set(questionId, state);
  }

  updateQuestionState(
    questionId: number,
    selectedOptionId: number,
    isCorrect: boolean,
    totalCorrectAnswers: number) {
    if (typeof selectedOptionId === 'undefined') {
      console.error('SelectedOptionId is undefined', { questionId, isCorrect });
      return;
    }

    // Retrieve the current state for the question
    let currentState = this.getQuestionState(questionId) || {
      isAnswered: false,
      numberOfCorrectAnswers: 0,
      selectedOptions: [],
      explanationDisplayed: false
    };

    if (!currentState.selectedOptions.includes(selectedOptionId.toString())) {
      currentState.selectedOptions.push(selectedOptionId.toString());

      if (isCorrect && currentState.numberOfCorrectAnswers < totalCorrectAnswers) {
        currentState.numberOfCorrectAnswers++;
      }
    }

    currentState.isAnswered = true;
    currentState.explanationDisplayed = true;

    this.setQuestionState(questionId, currentState);
  }

  updateCurrentQuizState(question$: Observable<QuizQuestion | null>): void {
    if (question$ === null || question$ === undefined) {
      throwError('Question$ is null or undefined.');
      return;
    }

    question$.pipe(
      catchError((error: any) => {
        console.error(error);
        return throwError(error);
      }),
      distinctUntilChanged()
    ).subscribe((question: QuizQuestion) => {
      this.currentQuestion.next(question);
      this.currentQuestionSubject.next(question);

      if (question && question.options) {
        this.currentQuestion.next(question);
        this.currentOptionsSubject.next(question?.options || []);
      } else {
        console.log('No options found.');
      }
    });
  }

  createDefaultQuestionState(): QuestionState {
    return {
      isAnswered: false,
      numberOfCorrectAnswers: 0,
      selectedOptions: [],
      explanationDisplayed: false
    };
  }

  isMultipleAnswerQuestion(question: QuizQuestion): Observable<boolean> {
    try {
      let correctAnswersCount: number;
      if (question && Array.isArray(question.options)) {
        // Check if the question has more than one correct answer
        correctAnswersCount = question.options
          .filter(option => option.correct)
          .length;
        const hasMultipleAnswers = correctAnswersCount > 1;
        return of(hasMultipleAnswers);
      } else {
        correctAnswersCount = 0;
        return of(false);
      }
    } catch (error) {
      console.error('Error determining if it is a multiple-answer question:', error);
      return of(false);
    }
  }

  setQuizQuestionCreated(): void {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated(): boolean {
    return this.quizQuestionCreated;
  }

  updateCorrectAnswersText(newText: string): void {
    this.correctAnswersTextSource.next(newText);
  }
}
