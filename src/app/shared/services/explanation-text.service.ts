import { Injectable, NgZone, OnDestroy } from '@angular/core';
import {
  BehaviorSubject,
  forkJoin,
  Observable,
  of,
  ReplaySubject,
  Subject,
  Subscription,
} from 'rxjs';
import { filter, mapTo, take, takeUntil, tap } from 'rxjs/operators';

import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';

@Injectable({
  providedIn: 'root',
})
export class ExplanationTextService implements OnDestroy {
  explanationText$: BehaviorSubject<string | null> = new BehaviorSubject<
    string | null
  >('');
  explanations: string[] = [];
  explanationTexts: { [key: string]: string } = {};
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>(
    ''
  );
  formattedExplanations$: (BehaviorSubject<string> | ReplaySubject<string>)[] =
    [];
  formattedExplanations: FormattedExplanation[] = [];
  processedQuestions: Set<string> = new Set<string>();
  processedQuestionsSubject: BehaviorSubject<Set<string>> = new BehaviorSubject<
    Set<string>
  >(new Set());
  questionIndexCounter = 0;
  formattedExplanationsDictionary: { [key: string]: BehaviorSubject<string> } =
    {};

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

  private isInitializationComplete = false;

  lastDisplayedExplanationText = '';

  subscriptions: Subscription[] = [];

  lastFormattedExplanation: string | undefined;
  lastFormattedExplanationSubject: BehaviorSubject<string> | undefined;

  private destroyed$ = new Subject<void>();

  constructor(private ngZone: NgZone) {
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

  updateFormattedExplanation(
    questionIndex: number,
    formattedExplanation: string
  ): void {
    console.log('Updating explanation for index:', questionIndex);
    console.log('New explanation:', formattedExplanation);

    // Verify that the index is valid
    if (this.formattedExplanations$[questionIndex]) {
      console.log('Observable is initialized for index', questionIndex);

      // Log the formatted explanation just before the pipe operation
      console.log(
        'Formatted explanation just before pipe:',
        formattedExplanation
      );

      // Update the explanation text based on the provided question index
      const observable = this.formattedExplanations$[questionIndex];

      // Add the tap operator directly to the existing observable
      const subscription = observable
        .pipe(
          tap((value) =>
            console.log(
              `Formatted explanation for index ${questionIndex}:`,
              value
            )
          )
        )
        .subscribe();

      // Ensure that the subscription is kept alive
      this.subscriptions.push(subscription);

      // Update the explanation text
      observable.next(formattedExplanation);
    } else {
      console.error(`Observable not initialized for index ${questionIndex}`);
    }
  }

  // Initialize formattedExplanations$ if it's not already initialized
  async initializeFormattedExplanations(numQuestions: number): Promise<void> {
    // Initialize formattedExplanations$ if it's not already initialized
    if (!this.formattedExplanations$ || this.formattedExplanations$.length !== numQuestions) {
      this.formattedExplanations$ = Array.from(
        { length: numQuestions },
        () => new BehaviorSubject<string>('')
      );
      console.log('Formatted Explanations Array:', this.formattedExplanations$);
    }
  
    // Create a promise array to ensure the order of operations
    const initializationPromises = [];
  
    // Populate the dictionary during initialization
    for (let questionIndex = 0; questionIndex < numQuestions; questionIndex++) {
      const questionKey = `Q${questionIndex + 1}`;
      this.formattedExplanationsDictionary[questionKey] = this.formattedExplanations$[questionIndex];
  
      // Calculate the initial explanation for each question and push the promise
      initializationPromises.push(this.calculateInitialFormattedExplanation(questionIndex, questionKey));
    }
  
    // Wait for all promises to resolve before proceeding
    await Promise.all(initializationPromises);
  
    // Set the flag to indicate initialization is complete
    this.isInitializationComplete = true;
  
    console.log('Observables after initialization:', this.formattedExplanations$);
    console.log('Dictionary after initialization:', this.formattedExplanationsDictionary);
  }

  private async formatExplanationTextForInitialization(
    questionIndex: number
  ): Promise<void> {
    const questionKey = `Q${questionIndex + 1}`;
    const formattedExplanation$ = this.formattedExplanations$[questionIndex];
    console.log(`Formatting explanation for initialization: ${questionKey}`);

    // Log the observable for each question during initialization
    const initializationObservable = formattedExplanation$.pipe(
      take(1),
      tap((value) =>
        console.log(
          `Formatted explanation for ${questionKey}:`,
          value?.toString()
        )
      )
    );

    // Wait for the initialization to complete
    await initializationObservable.toPromise();

    // If the BehaviorSubject is still uninitialized, set the initial value
    if (!formattedExplanation$.value) {
      const initialFormattedExplanation =
        this.calculateInitialFormattedExplanation(questionIndex);
      formattedExplanation$.next(initialFormattedExplanation);
    }
  }

  private getExplanationValue(
    subject: BehaviorSubject<string> | ReplaySubject<string>
  ): string | undefined {
    if (subject instanceof BehaviorSubject) {
      return subject.value;
    } else if (subject instanceof ReplaySubject) {
      const events = (subject as any)._events;
      const latestValue = events[events.length - 1]?.args[0];
      return latestValue !== undefined ? latestValue : '';
    }
    return undefined;
  }
  
  async calculateInitialFormattedExplanation(questionIndex: number, questionKey: string): Promise<string> {
    console.log(`Calculating initial explanation for ${questionKey}`);
  
    // Check if the BehaviorSubject is initialized
    if (!this.formattedExplanations$ || !this.formattedExplanations$[questionIndex] || !(this.formattedExplanations$[questionIndex] instanceof BehaviorSubject)) {
      console.error(`Subject not initialized or not an instance of BehaviorSubject for ${questionKey}`);
      return 'No explanation available';
    }
  
    // Check if the explanation text for the question exists
    const explanationText = this.explanationTexts[questionKey];
  
    // Use NgZone to run the async code within Angular's zone
    return this.ngZone.run(async () => {
      // Create a new Promise to handle asynchronous subscription
      return new Promise<string>((resolve) => {
        // Subscribe to the BehaviorSubject to get the current value
        const subscription = this.formattedExplanations$[questionIndex].pipe(take(1)).subscribe((currentValue) => {
          // If the current value is an empty string or undefined, set the initial value
          if (currentValue === undefined || currentValue === '') {
            const initialFormattedExplanation = explanationText !== undefined && explanationText !== null
              ? `${explanationText}`
              : 'No explanation available';
            this.formattedExplanations$[questionIndex].next(initialFormattedExplanation);
  
            // Update the dictionary with the initial value
            this.formattedExplanationsDictionary[questionKey] = this.formattedExplanations$[questionIndex] as BehaviorSubject<string>;
  
            // Resolve the Promise with the initial value
            resolve(initialFormattedExplanation);
          }
        });
  
        // Unsubscribe after getting the initial value or encountering an error
        subscription.add(() => {
          subscription.unsubscribe();
        });
      });
    });
  }
          
  // Function to introduce a delay
  delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getFormattedExplanationObservable(questionKey: string): Observable<string> {
    // Verify that the questionKey is within the bounds of the array
    if (!this.formattedExplanations$.hasOwnProperty(questionKey)) {
      this.formattedExplanations$[questionKey] = new BehaviorSubject<string>(
        ''
      );
    }
    return this.formattedExplanations$[questionKey].asObservable();
  }

  async formatExplanationText(
    question: QuizQuestion,
    questionIndex: number
  ): Promise<string> {
    const questionKey = `Q${questionIndex + 1}`;
  
    if (!question || !question.questionText || this.processedQuestions.has(questionKey)) {
      console.log('Skipping already processed or invalid question:', question.questionText);
      return 'No explanation available';
    }
  
    console.log('Processing question:', question.questionText);
  
    // Set the formatted explanation for the question using the existing BehaviorSubject
    const formattedExplanation$ = this.initializeExplanationSubject(questionIndex);
  
    // Check if the BehaviorSubject is initialized
    if (!formattedExplanation$) {
      console.error(`BehaviorSubject not initialized for ${questionKey}`);
      return 'No explanation available';
    }
  
    // Log the observable for the question before setting a new value
    formattedExplanation$.subscribe((value) => {
      console.log(`Formatted explanation for ${questionKey}:`, value?.toString());
    });
  
    // Generate the formatted explanation
    const correctOptionIndices: number[] = question.options
      .map((option, index) => (option.correct ? index + 1 : null))
      .filter((index) => index !== null);
  
    let formattedExplanation = '';
  
    if (correctOptionIndices.length > 1) {
      formattedExplanation = `Options ${correctOptionIndices.join(' and ')} are correct because ${question.explanation}`;
    } else if (correctOptionIndices.length === 1) {
      formattedExplanation = `Option ${correctOptionIndices[0]} is correct because ${question.explanation}`;
    } else {
      formattedExplanation = 'No correct option selected...';
    }

    // Save the lastFormattedExplanation for later use
    this.lastFormattedExplanation = formattedExplanation;
  
    // Use NgZone to run the async code within Angular's zone
    await this.ngZone.run(() => {
      // Set the value using next
      this.formattedExplanations$[questionIndex].next(formattedExplanation);
  
      // Log the stored explanation text for the question
      console.log(`Stored explanation text for ${questionKey}: ${formattedExplanation}`);
    });
  
    // Update the processedQuestions set
    this.processedQuestionsSubject.next(this.processedQuestions);
    this.processedQuestions.add(questionKey);
  
    return formattedExplanation;
  }
  
  private initializeExplanationSubject(questionIndex: number): BehaviorSubject<string> {
    const questionKey = `Q${questionIndex + 1}`;
  
    // If it's not already initialized, create a new BehaviorSubject
    if (!this.formattedExplanations$[questionIndex]) {
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<string>('');
  
      // Log the observable for the question
      this.formattedExplanations$[questionIndex].pipe(
        take(1),
        tap(value => console.log(`Formatted explanation for ${questionKey}:`, value?.toString()))
      ).subscribe();
  
      // Set the initial value based on your logic
      const initialFormattedExplanation = this.calculateInitialFormattedExplanation(questionIndex);
      this.formattedExplanations$[questionIndex].next(initialFormattedExplanation);
    } else {
      // If it's already initialized, log the current value
      console.log(`Formatted explanation for ${questionKey}:`, this.formattedExplanations$[questionIndex].value?.toString());
    }
  
    return this.formattedExplanations$[questionIndex];
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
    this.explanationTexts = {};
    this.explanationText$.next(null);
    this.nextExplanationText$ = new BehaviorSubject<string | null>(null);
    this.shouldDisplayExplanation$ = new BehaviorSubject<boolean>(false);
    this.isExplanationTextDisplayedSource.next(false);
    this.shouldDisplayExplanationSource.next(false);
  }
}
