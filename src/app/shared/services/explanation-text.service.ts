import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import {
  debounceTime,
  first,
  interval,
  map,
  switchMap,
  take,
  takeUntil,
  tap, 
  throwError
} from 'rxjs/operators';

import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService implements OnDestroy {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanations: string[] = [];
  explanationTexts: { [questionIndex: number]: string } = {};
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  formattedExplanations$: BehaviorSubject<string>[] = [];
  formattedExplanations: FormattedExplanation[] = [];
  processedQuestions: Set<string> = new Set<string>();
  processedQuestionsSubject: BehaviorSubject<Set<string>> = new BehaviorSubject<Set<string>>(new Set());
  questionIndexCounter = 0;
  formattedExplanationsDictionary: { [key: string]: BehaviorSubject<string> } = {};

  private currentExplanationTextSource = new BehaviorSubject<string>('');
  currentExplanationText$ = this.currentExplanationTextSource.asObservable();

  private nextExplanationTextSource = new BehaviorSubject<string>(null);
  nextExplanationText$ = this.nextExplanationTextSource.asObservable();

  private previousExplanationTextSource = new BehaviorSubject<string>('');
  previousExplanationText$: Observable<string> =
    this.previousExplanationTextSource.asObservable();

  private isExplanationTextDisplayedSource = new BehaviorSubject<boolean>(
    false
  );
  isExplanationTextDisplayed$: Observable<boolean> =
    this.isExplanationTextDisplayedSource.asObservable();

  private shouldDisplayExplanationSource = new BehaviorSubject<boolean>(false);
  shouldDisplayExplanation$ =
    this.shouldDisplayExplanationSource.asObservable();

  lastDisplayedExplanationText = '';

  subscriptions: Subscription[] = [];

  private destroyed$ = new Subject<void>();

  constructor() {
    this.explanationText$.next('');
    this.shouldDisplayExplanationSource.next(false);

    // Subscribe to the observable with takeUntil
    this.formattedExplanation$
      .pipe(takeUntil(this.destroyed$))
      .subscribe((value) => {
        // Handle the value
        console.log('Received new formatted explanation:', value);
      });

    this.formattedExplanations$ = [];
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  getExplanationText$(): Observable<string | null> {
    return this.explanationText$.asObservable();
  }

  setExplanationTextForQuestionIndex(index: number, explanation: string): void {
    this.explanationTexts[index] = explanation;
  }

  getExplanationTextForQuestionIndex(index: number): string | undefined {
    return this.explanationTexts[index];
  }

  // Function to update explanations based on question ID or index
  updateExplanationForQuestion(
    questionId: string | number,
    explanation: string
  ): void {
    this.explanationTexts[questionId] = explanation;
  }

  // Retrieve explanation for a specific question
  getExplanationForQuestion(questionId: string | number): string | undefined {
    return this.explanationTexts[questionId];
  }

  getFormattedExplanation$(questionKey: string): Observable<string> {
    const observable = this.formattedExplanationsDictionary[questionKey];
  
    if (observable && typeof observable.pipe === 'function') {
      console.log(`Observable found for key ${questionKey}`);
      return observable;
    } else {
      console.error(`Observable not initialized for key ${questionKey}`);
      return new Observable<string>();
    }
  }
  
  resetProcessedQuestionsState() {
    this.processedQuestions = new Set<string>();
  }

  get processedQuestions$(): Observable<Set<string>> {
    return this.processedQuestionsSubject.asObservable();
  }

  updateFormattedExplanation(questionIndex: number, formattedExplanation: string): void {
    console.log('Updating explanation for index:', questionIndex);
    console.log('New explanation:', formattedExplanation);
  
    // Verify that the index is valid
    if (this.formattedExplanations$[questionIndex]) {
      console.log('Observable is initialized for index', questionIndex);
  
      // Log the formatted explanation just before the pipe operation
      console.log('Formatted explanation just before pipe:', formattedExplanation);
  
      // Update the explanation text based on the provided question index
      const observable = this.formattedExplanations$[questionIndex];
  
      // Add the tap operator directly to the existing observable
      const subscription = observable.pipe(
        tap(value => console.log(`Formatted explanation for index ${questionIndex}:`, value))
      ).subscribe();
  
      // Ensure that the subscription is kept alive
      this.subscriptions.push(subscription);
  
      // Update the explanation text
      observable.next(formattedExplanation);
    } else {
      console.error(`Observable not initialized for index ${questionIndex}`);
    }
  }

  async initializeFormattedExplanations(numQuestions: number): Promise<void> {
    // Initialize formattedExplanations$ if it's not already initialized
    if (!this.formattedExplanations$ || this.formattedExplanations$.length !== numQuestions) {
      this.formattedExplanations$ = Array.from({ length: numQuestions }, () => new BehaviorSubject<string>(''));
      console.log('Formatted Explanations Array:', this.formattedExplanations$);
    }
  
    // Initialize formattedExplanationsDictionary
    this.formattedExplanationsDictionary = {};
  
    // Create an array to store observables
    const observables: BehaviorSubject<string>[] = [];

    this.formattedExplanations$.forEach((subject, questionIndex) => {
      const questionKey = `Q${questionIndex + 1}`;

      // Log the observable for each question during initialization
      const observable = new BehaviorSubject<string>('');
      const subscription = subject.pipe(
        take(1)
      ).subscribe({
        next: (value) => {
          observable.next(value);
          console.log(`Formatted explanation for ${questionKey}: ${value}`);
        },
        error: (error) => {
          console.error(`Error in observable for ${questionKey}:`, error);
        },
        complete: () => {
          if (subscription) {
            subscription.unsubscribe();
          }
        }
      });

      observables.push(observable);
    });

    // Log observables just before waiting for them to emit
    console.log('Observables just before waiting for emit:', observables);

    // Log observable types just before waiting for them to emit
    observables.forEach((observable, index) => {
      console.log(`Observable ${index + 1} type:`, observable.constructor.name);
    });

    // Wait for all observables to emit at least once
    await Promise.all(observables.map(obs => obs.pipe(take(1)).toPromise()));

    // Log observables after emitting
    console.log('Observables after emit:', observables);

    // All Observables have emitted at least once, now populate the dictionary
    this.formattedExplanations$.forEach((subject, questionIndex) => {
      const questionKey = `Q${questionIndex + 1}`;
      this.formattedExplanationsDictionary[questionKey] = subject;
    });

    console.log('Number of formatted explanations after emit:', this.formattedExplanations$.length);

    // Log the dictionary after all observables have emitted
    console.log('Formatted Explanations Dictionary:', this.formattedExplanationsDictionary);
  }
             
  // Function to introduce a delay
  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
                
  getFormattedExplanationObservable(questionKey: string): Observable<string> {
    // Verify that the questionKey is within the bounds of the array
    if (!this.formattedExplanations$.hasOwnProperty(questionKey)) {
        this.formattedExplanations$[questionKey] = new BehaviorSubject<string>('');
    }
    return this.formattedExplanations$[questionKey].asObservable();
  }

  formatExplanationText(question: QuizQuestion, questionIndex: number): void {
    const questionKey = `Q${questionIndex + 1}`;

    if (!question || !question.questionText || this.processedQuestions.has(questionKey)) {
        console.log('Skipping already processed or invalid question:', question.questionText);
        return;
    }

    console.log('Processing question:', question.questionText);

    const correctOptionIndices: number[] = question.options
        .map((option, index) => (option.correct ? index + 1 : null))
        .filter(index => index !== null);

    let formattedExplanation = '';

    if (correctOptionIndices.length > 1) {
        formattedExplanation = `Options ${correctOptionIndices.join(' and ')} are correct because ${question.explanation}`;
    } else if (correctOptionIndices.length === 1) {
        formattedExplanation = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
    } else {
        formattedExplanation = 'No correct option selected...';
    }

    // Set the formatted explanation for the question
    const explanationSubject = new BehaviorSubject<string>(formattedExplanation);
    this.formattedExplanationsDictionary[questionKey] = explanationSubject.asObservable();

    // Update the processedQuestions set
    this.processedQuestionsSubject.next(this.processedQuestions);

    // Log the observable for the question
    explanationSubject.subscribe(value => {
        console.log(`Formatted explanation for ${questionKey}:`, value?.toString());
    });

    this.processedQuestions.add(questionKey);
  }

  // Function to set or update the formatted explanation for a question
  setFormattedExplanationForQuestion(
    questionIndex: number,
    explanation: string
  ): void {
    const existingIndex = this.formattedExplanations.findIndex(
      (exp) => exp.questionIndex === questionIndex
    );

    if (existingIndex > -1) {
      this.formattedExplanations[existingIndex].explanation = explanation;
    } else {
      this.formattedExplanations.push({ questionIndex, explanation });
    }
  }

  // Function to retrieve the formatted explanation for a question
  getFormattedExplanationForQuestion(
    questionIndex: number
  ): string | undefined {
    const explanationObj = this.formattedExplanations.find(
      (exp) => exp.questionIndex === questionIndex
    );

    return explanationObj ? explanationObj.explanation : undefined;
  }

  // Function to aggregate the formatted explanations
  aggregateFormattedExplanations(questions: QuizQuestion[]): string[] {
    const formattedExplanations: string[] = [];

    for (const question of questions) {
      const explanation = this.getFormattedExplanationForQuestion(
        questions.indexOf(question)
      );
      formattedExplanations.push(explanation || '');
    }

    return formattedExplanations;
  }

  updateExplanationTextForCurrentAndNext(
    currentExplanationText: string,
    nextExplanationText: string
  ) {
    try {
      this.currentExplanationTextSource.next(currentExplanationText);
      this.nextExplanationTextSource.next(nextExplanationText);
      console.log(
        'Updated explanation text for current question:',
        currentExplanationText
      );
      console.log(
        'Updated explanation text for next question:',
        nextExplanationText
      );
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
  }

  toggleExplanationDisplay(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  setNextExplanationText(explanationText: string): void {
    try {
      console.log('Setting next explanation text:', explanationText);
      this.nextExplanationTextSource.next(explanationText);
    } catch (error) {
      console.error('Error updating explanation text:', error);
    }
  }

  setPreviousExplanationText(explanationText: string): void {
    this.previousExplanationTextSource.next(explanationText);
  }

  getNextExplanationText(): Observable<string> {
    return this.nextExplanationText$;
  }

  setIsExplanationTextDisplayed(isDisplayed: boolean): void {
    console.log('Setting isExplanationTextDisplayed to', isDisplayed);
    this.isExplanationTextDisplayedSource.next(isDisplayed);
  }

  setShouldDisplayExplanation(shouldDisplay: boolean): void {
    this.shouldDisplayExplanationSource.next(shouldDisplay);
  }

  clearExplanationText(): void {
    console.log('clearExplanationText() called');
    this.explanationText$.next('');
    this.nextExplanationTextSource.next('');
  }

  resetExplanationState() {
    console.log('resetExplanationState() called');
    this.questionIndexCounter = 0;
    this.formattedExplanation$.next('');
    this.explanationTexts = [];
    this.explanationText$.next(null);
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}
