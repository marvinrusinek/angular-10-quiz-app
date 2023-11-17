import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, of, Subject, Subscription } from 'rxjs';
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
  // formattedExplanations$: BehaviorSubject<string>[] = [];
  formattedExplanations$: { [key: string]: BehaviorSubject<string> } = {};
  formattedExplanations: FormattedExplanation[] = [];
  processedQuestions: Set<string> = new Set<string>();
  questionIndexCounter = 0;
  formattedExplanationsDictionary: { [key: string]: Observable<string> } = {};

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
      return observable;
    } else {
      console.error(`Observable not initialized for key ${questionKey}`);
      return new Observable<string>();
    }
  }
  
  resetProcessedQuestionsState() {
    this.processedQuestions = new Set<string>();
  }

  getFormattedExplanationObservable(questionIndex: number): Observable<string> {
    // Verify that the questionIndex is within the bounds of the array
    if (questionIndex < 0 || questionIndex >= this.formattedExplanations$.length) {
      this.formattedExplanations$[questionIndex] = new BehaviorSubject<string>('');
    }
    return this.formattedExplanations$[questionIndex].asObservable();
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

  initializeFormattedExplanations(numQuestions: number): void {
    console.log('Before initializing formattedExplanations$:', this.formattedExplanations$);

    // Ensure formattedExplanations$ is a dictionary
    if (Object.keys(this.formattedExplanations$).length !== numQuestions) {
      // Initialize formattedExplanations$ dictionary with empty subjects
      this.formattedExplanations$ = {};
      for (let questionIndex = 0; questionIndex < numQuestions; questionIndex++) {
        const questionKey = `Q${questionIndex + 1}`;
        this.formattedExplanations$[questionKey] = new BehaviorSubject<string>('');

        // Log the observable for each question
        this.formattedExplanations$[questionKey].asObservable().subscribe(value => {
          console.log(`Formatted explanation for ${questionKey}:`, value?.toString());
        });
      }

      console.log('Formatted Explanations Dictionary:', this.formattedExplanations$);

      // Initialize formattedExplanationsDictionary
      this.formattedExplanationsDictionary = {};
      for (const key in this.formattedExplanations$) {
        if (this.formattedExplanations$.hasOwnProperty(key)) {
          this.formattedExplanationsDictionary[key] = this.formattedExplanations$[key].asObservable();
        }
      }

      console.log('Formatted Explanations Dictionary:');
      for (const key in this.formattedExplanationsDictionary) {
        if (this.formattedExplanationsDictionary.hasOwnProperty(key)) {
          const value = this.formattedExplanationsDictionary[key];
          // Log the observable for each question
          value.subscribe(v => {
            console.log(`Key: ${key}, Value:`, v?._value);
          });
        }
      }
    }
  }


  
  formatExplanationText(question: QuizQuestion, questionIndex: number): { explanation: string } {
    const questionKey = JSON.stringify(question);
    this.processedQuestions.clear();

    if (!question || !question.questionText || this.processedQuestions.has(question.questionText)) {
        console.log('Skipping already processed or invalid question:', question.questionText);
        return { explanation: '' };
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
    this.formattedExplanation$.next(formattedExplanation);
    this.processedQuestions.add(questionKey);

    console.log('Formatted explanation for question:', formattedExplanation);

    return { explanation: formattedExplanation };
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
