import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged } from 'rxjs/operators';

import { QuestionState } from '../../shared/models/QuestionState.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
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

  questionStates: Map<number, QuestionState> = new Map();
  private quizQuestionCreated = false;

  constructor() {
    this.questionStates = new Map<number, QuestionState>();
  }

  saveState(quizId: string): void {
    const stateObject = Object.fromEntries(this.questionStates);
    localStorage.setItem(`quizState_${quizId}`, JSON.stringify(stateObject));
  }

  getStoredState(quizId: string): Map<number, QuestionState> | null {
    const stateJSON = localStorage.getItem(`quizState_${quizId}`);
    if (stateJSON) {
      try {
        const stateObject = JSON.parse(stateJSON);
  
        // Additional check to ensure the parsed object matches the expected structure
        if (typeof stateObject === 'object' && !Array.isArray(stateObject)) {
          return new Map<number, QuestionState>(
            Object.entries(stateObject).map(([key, value]): [number, QuestionState] => {
              // Further validation to ensure each key-value pair matches the expected types
              const parsedKey = Number(key);
              if (!isNaN(parsedKey) && typeof value === 'object' && value !== null && 'isAnswered' in value) {
                return [parsedKey, value as QuestionState];
              } else {
                throw new Error(`Invalid question state format for questionId ${key}`);
              }
            })
          );
        } else {
          throw new Error('Stored state is not in object format');
        }
      } catch (error) {
        console.error(`Error parsing stored state for quizId ${quizId}:`, error);
        return null;
      }
    }
    return null;
  }

  // Method to set or update the state for a question
  setQuestionState(questionId: number, state: QuestionState): void {
    // console.log(`Setting state for questionId ${questionId}:`, state);
    this.questionStates.set(questionId, state);
  }

  // Method to get the state of a question by its ID
  getQuestionState(questionId: number): QuestionState {
    // console.log(`Getting state for questionId ${questionId}`);
    // console.log(`Current question states:`, Array.from(this.questionStates.entries()));
    let state = this.questionStates.get(questionId);
    if (!state) {
      state = this.createDefaultQuestionState();
      this.questionStates.set(questionId, state);
    }
    return state;
  }
  
  updateQuestionState(
    questionId: number,
    selectedOptionId: number,
    isCorrect?: boolean,
    totalCorrectAnswers?: number) {
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

    // Ensure selectedOptions is an array before using includes and push
    if (Array.isArray(currentState.selectedOptions)) {
      if (!currentState.selectedOptions.includes(selectedOptionId.toString())) {
        currentState.selectedOptions.push(selectedOptionId.toString());

        if (isCorrect && currentState.numberOfCorrectAnswers < totalCorrectAnswers) {
          currentState.numberOfCorrectAnswers++;
        }
      }
    } else {
      console.error('selectedOptions is not an array', { currentState });
      currentState.selectedOptions = [selectedOptionId.toString()];
    }

    currentState.isAnswered = true;
    currentState.explanationDisplayed = true;

    this.setQuestionState(questionId, currentState);
  }

  createDefaultQuestionState(): QuestionState {
    return {
      isAnswered: false,
      numberOfCorrectAnswers: 0,
      selectedOptions: [],
      explanationDisplayed: false
    };
  }

  applyDefaultStates(quizId: string, questions: QuizQuestion[]): void {
    questions.forEach((question, index) => {
      // Use the index as the question identifier
      const questionId = index;
      const defaultState = this.createDefaultQuestionState();
  
      // Apply the default state to each question using its index as the identifier
      this.setQuestionState(questionId, defaultState);
    });
  
    console.log(`Default states applied for all questions in quizId: ${quizId}`);
  }

  markQuestionAsAnswered(questionIndex: number, showExplanation: boolean) {
    const questionState = this.getQuestionState(questionIndex) || this.createDefaultQuestionState();
    questionState.isAnswered = true;
    questionState.explanationDisplayed = showExplanation;
    this.questionStates.set(questionIndex, questionState);
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

  updateCurrentQuestion(newQuestion: QuizQuestion): void {
    this.currentQuestionSubject.next(newQuestion);
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

  /* not being used, potentially remove...
  updateCorrectAnswersText(newText: string): void {
    this.correctAnswersTextSource.next(newText);
  } */
}
