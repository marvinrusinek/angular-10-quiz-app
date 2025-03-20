import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';
import { catchError, distinctUntilChanged } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({ providedIn: 'root' })
export class QuizStateService {
  quizState: { [quizId: string]: { [questionIndex: number]: { explanation?: string } } } = {};

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

  private restoreStateSubject = new Subject<void>();

  private quizQuestionCreated = false;
  public displayExplanationLocked = false;

  loadingSubject = new BehaviorSubject<boolean>(false);
  loading$: Observable<boolean> = this.loadingSubject.asObservable();

  isLoadingSubject = new BehaviorSubject<boolean>(false);
  public isLoading$ = this.isLoadingSubject.asObservable();

  isNavigatingSubject = new BehaviorSubject<boolean>(false);
  public isNavigating$ = this.isNavigatingSubject.asObservable();
  
  answeredSubject = new BehaviorSubject<boolean>(false);
  isAnswered$: Observable<boolean> = this.answeredSubject.asObservable();

  private isNextButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  isNextButtonEnabled$ = this.isNextButtonEnabledSubject.asObservable();

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
  
    let state = this.quizStates[quizId].get(questionId) ?? this.createDefaultQuestionState();
    this.quizStates[quizId].set(questionId, state); // Store the default state in the quiz's state map
  
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

  // Store explanation for a question
  /* setQuestionExplanation(quizId: string, questionIndex: number, explanation: string): void {
    if (!this.quizState[quizId]) {
      this.quizState[quizId] = {};
    }

    // Ensure we store under the correct questionIndex
    console.log(`[QuizStateService] 🟢 Storing Explanation for Q${questionIndex}:`, explanation);

    // Prevent overwriting if explanation already exists
    if (this.quizState[quizId][questionIndex]?.explanation) {
      console.warn(`[QuizStateService] ⚠️ Explanation for Q${questionIndex} already exists. Skipping storage.`);
      return;
    }

    this.quizState[quizId][questionIndex] = {
      ...(this.quizState[quizId][questionIndex] || {}),
      explanation
    };

    console.log(`[QuizStateService] 🟢 STORED Explanation for Q${questionIndex}:`, explanation);
    console.log(`[QuizStateService] 🟢 FULL STATE AFTER STORAGE:`, JSON.stringify(this.quizState, null, 2));
    console.log(`[QuizStateService] ✅ Confirmed Storage for Q${questionIndex}:`, this.quizState[quizId][questionIndex].explanation);
  } */
  setQuestionExplanation(quizId: string, questionIndex: number, explanation: string): void {
    if (!this.quizState[quizId]) {
        this.quizState[quizId] = {};
    }

    if (!this.quizState[quizId][questionIndex]) {
        this.quizState[quizId][questionIndex] = {};
    }

    this.quizState[quizId][questionIndex] = { explanation };

    console.log(`[setQuestionExplanation] 📝 Storing Explanation for Q${questionIndex}:`, explanation);
    console.log(`[setQuestionExplanation] 🔍 Current QuizState:`, JSON.stringify(this.quizState));
  }

  // Method to retrieve stored explanation text
  getStoredExplanation(quizId: string, questionIndex: number): string | null {
    const explanationObject = this.quizState[quizId]?.[questionIndex];
    const explanation = explanationObject?.explanation || null;

    console.log(`[getStoredExplanation] 🔍 Retrieving Explanation for Q${questionIndex}:`, explanation);
    return explanation;
  }

  logStoredExplanations(quizId: string): void {
    if (!this.quizState[quizId]) {
      console.warn(`[DEBUG] 🚨 No stored explanations found for quizId=${quizId}`);
      return;
    }

    console.log(`[DEBUG] 📌 CURRENTLY STORED EXPLANATIONS for quizId=${quizId}:`);
    console.table(this.quizState[quizId]);  // LOG STORED EXPLANATIONS
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
        this.currentOptionsSubject.next(question?.options ?? []);
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

  setNextButtonEnabled(enabled: boolean): void {
    this.isNextButtonEnabledSubject.next(enabled);
  }

  notifyRestoreQuestionState(): void {
    this.restoreStateSubject.next();
  }
  
  onRestoreQuestionState(): Observable<void> {
    return this.restoreStateSubject.asObservable();
  }

  // not being used, potentially remove...
  /* public shouldDisplayCorrectAnswersText(
    question: QuizQuestion,
    index: number
  ): Observable<boolean> {
    return combineLatest([
      this.isAnswered$,
      this.isMultipleAnswerQuestion(question),
    ]).pipe(
      map(([isAnswered, isMultipleAnswer]) => {
        console.log(
          `Question at index ${index} - Answered: ${isAnswered}, MultipleAnswer: ${isMultipleAnswer}`
        );
        return isAnswered && isMultipleAnswer;
      })
    );
  } */
  
  clearSelectedOptions(): void {
    for (const [key, state] of this.questionStates.entries()) {
      state.selectedOptions = [];
    }    
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

  setNavigating(isNavigating: boolean): void {
    this.isNavigatingSubject.next(isNavigating);
  }

  setLoading(isLoading: boolean): void {
    this.loadingSubject.next(isLoading);
    this.isLoadingSubject.next(isLoading);
  }

  setAnswered(isAnswered: boolean): void {
    this.answeredSubject.next(isAnswered);
  }

  // Method to set isAnswered and lock displayExplanation
  setAnswerSelected(isAnswered: boolean): void {
    this.answeredSubject.next(isAnswered);

    if (isAnswered && !this.displayExplanationLocked) {
      this.displayExplanationLocked = true;
    }
  }

  resetDisplayLock(): void {
    this.displayExplanationLocked = false; // Reset for new questions
  }

  startLoading(): void {
    if (!this.isLoading()) {
      console.log('Loading started');
      this.loadingSubject.next(true);
    }
  }

  stopLoading(): void {
    if (this.isLoading()) {
      console.log('Loading stopped');
      this.loadingSubject.next(false);
    }
  }

  resetState(): void {
    // this.currentQuestionIndex$.next(0);
    this.quizQuestionCreated = false;
  }
}