import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import { catchError, distinctUntilChanged, throwError } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

interface QuestionState {
  isAnswered: boolean;
  numberOfCorrectAnswers: number;
  selectedOptions: string[];
  explanationDisplayed?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class QuizStateService {
  currentQuestion: BehaviorSubject<QuizQuestion | null>
    = new BehaviorSubject<QuizQuestion | null>(null);
  private currentQuestionSource = new Subject<QuizQuestion>();
  private currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion> = this.currentQuestionSubject.asObservable();

  currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSubject.asObservable();

  private resetQuizSubject = new Subject<void>();
  resetQuiz$ = this.resetQuizSubject.asObservable();

  private correctAnswersTextSource = new BehaviorSubject<string>('Default Text');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private quizQuestionCreated = false;

  private questionStates: Map<number, QuestionState> = new Map();

  constructor() {
    this.questionStates = new Map<number, QuestionState>();
  }

  // Method to get the state of a question by its ID
  getQuestionState(questionId: number): QuestionState {
    console.log(`Getting state for questionId ${questionId}`);
    console.log(`Current question states:`, Array.from(this.questionStates.entries()));
    let state = this.questionStates.get(questionId);
    if (!state) {
      console.warn(`No state found for questionId ${questionId}, returning default state.`);
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

  updateQuestionState(questionId: number, selectedOptionId: number, isCorrect: boolean) {
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

    // Update the state based on the user's action
    currentState.selectedOptions.push(selectedOptionId.toString());
    if (isCorrect) {
      currentState.numberOfCorrectAnswers++;
    }
    currentState.isAnswered = true; // Mark as answered
    currentState.explanationDisplayed = true; // Set explanation to be displayed when updating state

    // Save the updated state
    this.setQuestionState(questionId, currentState);
  }

  showExplanationForQuestion(questionId: number) {
    let currentState = this.getQuestionState(questionId) || this.createDefaultQuestionState();
    currentState.explanationDisplayed = true; // Explicitly set explanation to be displayed
  
    this.setQuestionState(questionId, currentState); // Save the updated state
  }  

  createDefaultQuestionState(): QuestionState {
    return {
      isAnswered: false,
      numberOfCorrectAnswers: 0,
      selectedOptions: [],
      explanationDisplayed: false
    };
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
      this.currentQuestionSource.next(question);

      if (question && question.options) {
        this.currentQuestion.next(question);
        this.currentOptionsSubject.next(question?.options || []);
      } else {
        console.log('No options found.');
      }
    });
  }

  updateCorrectAnswersText(newText: string): void {
    this.correctAnswersTextSource.next(newText);
  }

  getCurrentQuestion(): Observable<QuizQuestion> {
    return this.currentQuestion$;
  }

  updateCurrentQuestion(newQuestion: QuizQuestion): void {
    this.currentQuestionSubject.next(newQuestion);
  }

  setCurrentOptions(options: Option[]): void {
    this.currentOptions$ = of(options);
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
}
