import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizStateService { 
  currentQuestion: BehaviorSubject<QuizQuestion | null>
    = new BehaviorSubject<QuizQuestion | null>(null);

  currentQuestionSubject = new BehaviorSubject<QuizQuestion | null>(null);
  currentQuestion$: Observable<QuizQuestion | null> = this.currentQuestionSubject.asObservable();

  private currentQuestionIndexSubject = new BehaviorSubject<number>(0);
  currentQuestionIndex$: Observable<number> = this.currentQuestionIndexSubject.asObservable();

  private currentOptionsSubject = new BehaviorSubject<Option[]>([]);
  currentOptions$: Observable<Option[]> = this.currentOptionsSubject.asObservable();

  private explanationDisplayedSubject = new BehaviorSubject<boolean>(false);
  explanationDisplayed$ = this.explanationDisplayedSubject.asObservable();

  private resetQuizSubject = new Subject<void>(); 
  resetQuiz$ = this.resetQuizSubject.asObservable(); // for quiz-content component

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  questionStates: Map<number, QuestionState> = new Map();
  private quizStates: { [quizId: string]: Map<number, QuestionState> } = {};

  private quizQuestionCreated = false;

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.loadingSubject.asObservable();

  private answeredSubject = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.answeredSubject.asObservable();

  constructor() {
    this.questionStates = new Map<number, QuestionState>();
  }

  setCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestionSubject.next(question);
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
  setQuestionState(quizId: string, questionId: number, state: QuestionState): void {
    // Check if the quizId already exists in the quizStates map, if not, create a new Map for it
    if (!this.quizStates[quizId]) {
      this.quizStates[quizId] = new Map<number, QuestionState>();
    }
  
    // Set the state for the given questionId within the specified quizId
    this.quizStates[quizId].set(questionId, state);
  }
  
  // Method to get the state of a question by its ID
  getQuestionState(quizId: string, questionId: number): QuestionState | undefined {
    // Initialize the state map for this quiz if it doesn't exist
    if (!this.quizStates[quizId]) {
      this.quizStates[quizId] = new Map<number, QuestionState>();
    }
  
    let state = this.quizStates[quizId].get(questionId);
    if (state === undefined) {
      state = this.createDefaultQuestionState();
      this.quizStates[quizId].set(questionId, state); // Store the default state in the quiz's state map
    }
  
    return state;
  }

  updateQuestionState(quizId: string, questionIndex: number, stateUpdates: Partial<QuestionState>, totalCorrectAnswers: number): void {
    // Retrieve the current state for the question or initialize if not present
    let currentState = this.getQuestionState(quizId, questionIndex) || {
      isAnswered: false,
      selectedOptions: [],
      numberOfCorrectAnswers: 0  // Ensure this property is properly initialized
    };
  
    // If updating selected options and the question has correct answers to track
    if (stateUpdates.selectedOptions && totalCorrectAnswers > 0) {
      // Ensure selectedOptions is an array and update it based on stateUpdates
      currentState.selectedOptions = Array.isArray(currentState.selectedOptions) ? currentState.selectedOptions : [];
      
      for (const option of stateUpdates.selectedOptions) {
        if (!currentState.selectedOptions.some((selectedOption) => selectedOption.optionId === option.optionId)) {
          currentState.selectedOptions.push(option);
      
          if (option.correct === true && currentState.numberOfCorrectAnswers < totalCorrectAnswers) {
            currentState.numberOfCorrectAnswers++;
          }
        }
      }          
    
      // Mark as answered if the number of correct answers is reached
      currentState.isAnswered = currentState.numberOfCorrectAnswers >= totalCorrectAnswers;
    }
  
    // Merge the current state with other updates not related to selected options
    const newState = { ...currentState, ...stateUpdates };
  
    // Save the updated state
    this.setQuestionState(quizId, questionIndex, newState);
  }

  updateQuestionStateForExplanation(quizId: string, index: number): void {
    let questionState = this.getQuestionState(quizId, index);

    if (!questionState) {
      questionState = {
        isAnswered: false,
        explanationDisplayed: false,
        selectedOptions: []
      };
    }

    questionState.explanationDisplayed = true;
    questionState.isAnswered = true;

    // Save the updated state
    this.setQuestionState(quizId, index, questionState);
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
    // Initialize the state map for this quiz if it doesn't exist
    if (!this.quizStates[quizId]) {
      this.quizStates[quizId] = new Map<number, QuestionState>();
    }
  
    for (const [index, question] of questions.entries()) {
      const defaultState = this.createDefaultQuestionState();
      // Apply the default state to each question using its index as the identifier within the specific quiz's state map
      this.quizStates[quizId].set(index, defaultState);
    }    
  }
  
  updateCurrentQuizState(question$: Observable<QuizQuestion | null>): void {
    if (question$ === null || question$ === undefined) {
      throw new Error('Question$ is null or undefined.');
      return;
    }

    question$.pipe(
      catchError((error: any) => {
        console.error(error);
        return throwError(() => new Error(error));
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

  setExplanationDisplayed(isDisplayed: boolean): void {
    this.explanationDisplayedSubject.next(isDisplayed);
  }

  isMultipleAnswerQuestion(question: QuizQuestion): Observable<boolean> {
    try {
      if (question && Array.isArray(question.options)) {
        const correctAnswersCount = question.options.filter(option => option.correct).length;
        const hasMultipleAnswers = correctAnswersCount > 1;
        return of(hasMultipleAnswers);
      } else {
        return of(false);
      }
    } catch (error) {
      console.error('Error determining if it is a multiple-answer question:', error);
      return of(false);
    }
  }

  clearSelectedOptions(): void {
    for (const [key, state] of this.questionStates.entries()) {
      state.selectedOptions = [];
    }    
  }

  setLoading(isLoading: boolean): void {
    this.loadingSubject.next(isLoading);
  }
  
  setAnswered(isAnswered: boolean): void {
    console.log('Emitting isAnswered:', isAnswered);
    this.answeredSubject.next(isAnswered);
  }

  setQuizQuestionCreated(): void {
    this.quizQuestionCreated = true;
  }

  getQuizQuestionCreated(): boolean {
    return this.quizQuestionCreated;
  }

  isLoading(): boolean {
    return this.loadingSubject.getValue();
  }

   // Method to start loading
   startLoading(): void {
    if (!this.isLoading()) {
      console.log('Loading started');
      this.loadingSubject.next(true);
    }
  }

  // Method to stop loading
  stopLoading(): void {
    if (this.isLoading()) {
      console.log('Loading stopped');
      this.loadingSubject.next(false);
    }
  }

  // Set the answered state, but only if the state actually changes
  setAnswerSelected(isAnswered: boolean): void {
    if (this.answeredSubject.getValue() !== isAnswered) {
      console.log(`Answered state changed to: ${isAnswered}`);
      this.answeredSubject.next(isAnswered);  // Emit only if the value changes
    }
  }

  // Example usage when an answer is clicked
  onAnswerSelected(option: Option): void {
    this.setAnswerSelected(true);  // Mark as answered
  }

  resetState(): void {
    // this.currentQuestionIndex$.next(0);
    this.quizQuestionCreated = false;
  }
}
