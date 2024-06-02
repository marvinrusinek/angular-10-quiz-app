import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, mergeMap, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

@Component({
  selector: 'codelab-quiz-content-component',
  templateUrl: './codelab-quiz-content.component.html',
  styleUrls: ['./codelab-quiz-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  // @Input() currentQuestion: BehaviorSubject<QuizQuestion> =
  //   new BehaviorSubject<QuizQuestion>(null);
  @Input() currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() correctAnswersText = '';
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();
  quizId = '';
  questionIndex: number;
  questionText = '';
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;
  isNavigatingToPrevious: boolean;
  currentQuestionType: QuestionType;

  displayCorrectAnswers = false;
  explanationDisplayed = false;
  isExplanationDisplayed = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> = new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;

  currentQuestionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;

  correctAnswersTextSource: BehaviorSubject<string> = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;
  explanationTexts: string[] = [];

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  questionIndexSubscription: Subscription;
  questionSubscription: Subscription;

  combinedText$: Observable<string>;
  textToDisplay = '';

  previousIndex: number | null = null; // to track if the index has changed

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private selectedOptionService: SelectedOptionService,
    private activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef
  ) {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;

    this.quizService.getIsNavigatingToPrevious().subscribe(
      isNavigating => this.isNavigatingToPrevious = isNavigating
    );
  }

  ngOnInit(): void {
    this.initializeSubscriptions();
    this.restoreQuestionState();
    this.subscribeToQuestionState();
    this.updateQuizStatus();
    this.initializeComponent();
    this.handleQuestionDisplayLogic();
    this.setupCombinedTextObservable();

    this.activatedRoute.paramMap.subscribe(params => {
      const quizId = params.get('quizId');
      const questionIndex = +params.get('questionIndex');
      this.loadQuestion(quizId, questionIndex - 1); // Convert to zero-based index
    });

    this.currentQuestion.pipe(
      debounceTime(200),
      tap((question: QuizQuestion | null) => {
        console.log('Current Question in Stream:', question);
      }),
      switchMap((question: QuizQuestion | null) => this.updateCorrectAnswersDisplay(question))
    ).subscribe()
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentQuestion && changes.currentQuestion.currentValue) {
      console.log('ngOnChanges - currentQuestion currentValue exists:', changes.currentQuestion.currentValue);
      const question = this.currentQuestion.getValue();
      this.updateCorrectAnswersDisplay(question).subscribe();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.correctAnswersTextSource.complete();
    this.correctAnswersDisplaySubject.complete();
    this.questionSubscription?.unsubscribe();
    this.questionIndexSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
  }

  loadQuestion(quizId: string, zeroBasedIndex: number) {
    console.log(`Loading question for quizId: ${quizId}, zeroBasedIndex: ${zeroBasedIndex}`);
    this.quizDataService.getQuestionsForQuiz(quizId).subscribe(questions => {
      console.log('Questions loaded:', questions);
      if (questions && questions.length > 0 && zeroBasedIndex >= 0 && zeroBasedIndex < questions.length) {
        const question = questions[zeroBasedIndex];
        console.log('Selected question:', question);
        this.currentQuestion.next(question);
      } else {
        console.error('Invalid question index:', zeroBasedIndex);
      }
    });
  }

  initializeSubscriptions(): void {
    this.initializeQuestionIndexSubscription();
    this.initializeResetQuizSubscription();
    this.initializeExplanationDisplaySubscription();
    this.initializeExplanationTextSubscription();
  }

  private initializeQuestionIndexSubscription(): void {
    this.quizService.getCurrentQuestionIndexObservable()
      .pipe(takeUntil(this.destroy$))
      .subscribe((index: number) => {
        this.currentQuestionIndexValue = index;
      });
  }
  
  private initializeResetQuizSubscription(): void {
    this.quizStateService.resetQuiz$.subscribe(() => {
      this.shouldDisplayCorrectAnswers = false;
    });
  }
  
  private initializeExplanationDisplaySubscription(): void {
    this.explanationTextService.shouldDisplayExplanationSource.subscribe(shouldDisplay => {
      this.quizService.shouldDisplayExplanation = shouldDisplay;
    });
  }
  
  private initializeExplanationTextSubscription(): void {
    this.formattedExplanationSubscription = this.explanationTextService.formattedExplanation$.subscribe(explanationText => {
      this.explanationText = explanationText;
      this.cdRef.detectChanges();
    });
  }

  async restoreQuestionState(): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndexValue);
    // console.log("QS", questionState, "for questionId", this.currentQuestionIndexValue);

    if (questionState) {
      const isQuestionAnswered = questionState.isAnswered;
      if (isQuestionAnswered) {
        this.quizService.displayExplanation = true;
        this.explanationText = await firstValueFrom(this.explanationTextService.getExplanationTextForQuestionIndex(this.currentQuestionIndexValue));
      }

      this.numberOfCorrectAnswers = questionState.numberOfCorrectAnswers;
      // Restore other parts of the question state as needed
      this.cdRef.detectChanges();
    }
  }

  subscribeToQuestionState(): void {
    this.quizService.getCurrentQuestionIndexObservable().subscribe(currentIndex => {
      const quizId = this.quizService.getCurrentQuizId();
      const questionId = this.quizService.getQuestionIdAtIndex(currentIndex);
  
      // Use both quizId and questionId to get the question state
      const state = this.quizStateService.getQuestionState(quizId, questionId);
  
      if (state && state.isAnswered) {
        this.explanationToDisplay = this.explanationTexts[currentIndex]; // Access the stored explanation text
      } else {
        this.explanationToDisplay = '';
      }
    });
  }

  private handleQuestionUpdate(): void {
    const question = this.currentQuestion.getValue();
    console.log('Handling question update with question:', question);

    if (!question) {
      console.error('Question is undefined in handleQuestionUpdate');
      return;
    }

    console.log('Question options:', question.options);
    if (!question.options || question.options.length === 0) {
      console.error('Question options are undefined or empty in handleQuestionUpdate');
      console.log('Question options:', question.options);
      return;
    }

    this.setDisplayStateForCorrectAnswers(question);

    /* if (this.quizStateService.isMultipleAnswerQuestion(question)) {
      const numberOfCorrectAnswers = question.options.filter(option => option.correct).length;
      this.shouldDisplayCorrectAnswers = numberOfCorrectAnswers > 1;
      this.quizService.updateCorrectAnswersText(`(${numberOfCorrectAnswers} answers are correct)`);
    } else {
      this.quizService.updateCorrectAnswersText('Select one answer');
    } */
  }

  private initializeComponent(): void {
    this.initializeQuestionData();
    this.initializeCombinedQuestionData();
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) =>
          this.fetchQuestionsAndExplanationTexts(params)),
        takeUntil(this.destroy$)
      )
      .subscribe(([questions, explanationTexts]) => {
        if (!questions) {
          return;
        }

        this.explanationTexts = explanationTexts;
        this.initializeCurrentQuestionIndex();
        this.subscribeToCurrentQuestion();
      });
  }

  private fetchQuestionsAndExplanationTexts(params: ParamMap):
    Observable<[QuizQuestion[] | null, string[]]> {
    this.quizId = params.get('quizId');
    if (this.quizId) {
      return forkJoin([
        this.quizDataService.getQuestionsForQuiz(this.quizId),
        this.quizDataService.getAllExplanationTextsForQuiz(this.quizId) // possibly remove
      ]).pipe(
        map(([questions, explanationTexts]) => [questions, explanationTexts])
      );
    } else {
      return of([null, []]);
    }
  }

  private initializeCurrentQuestionIndex(): void {
    this.quizService.currentQuestionIndex = 0;
    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
  }

  private subscribeToCurrentQuestion(): void {
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        mergeMap(async (question: QuizQuestion) => {
          if (question) {
            await this.processCurrentQuestion(question);
          }
        })
      )
      .subscribe();
  }

  private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    console.log("TEST QUESTION LOG", question);
    // Update question details and display correct answers
    this.updateQuestionDetailsAndDisplayCorrectAnswers(question);

    // Fetch and display explanation for the question
    await this.fetchAndDisplayExplanationText(question);

    // Determine if correct answers count should be displayed
    this.handleCorrectAnswersDisplay(question);
  }

  // Function to update question details and display correct answers
  private updateQuestionDetailsAndDisplayCorrectAnswers(question: QuizQuestion): void {
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
    this.calculateAndDisplayNumberOfCorrectAnswers();
  }

  // Function to handle the display of correct answers
  private handleCorrectAnswersDisplay(question: QuizQuestion): void {
    const isMultipleAnswer$ = this.quizStateService.isMultipleAnswerQuestion(question);
    const isExplanationDisplayed$ = this.explanationTextService.isExplanationDisplayed$;

    combineLatest([isMultipleAnswer$, isExplanationDisplayed$])
      .pipe(
        take(1),
        switchMap(([isMultipleAnswer, isExplanationDisplayed]) => {
          if (this.isSingleAnswerWithExplanation(isMultipleAnswer, isExplanationDisplayed)) {
            // For single-answer questions with an explanation, do not display correct answers
            return of(false);
          } else {
            // For all other cases, display correct answers
            return of(isMultipleAnswer && !isExplanationDisplayed);
          }
        })
      )
      .subscribe((shouldDisplayCorrectAnswers: boolean) => {
        this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
      });
  }

  // Helper function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }

  private calculateAndDisplayNumberOfCorrectAnswers(): void {
    if (this.questionIndexSubscription) {
      this.questionIndexSubscription.unsubscribe();
    }

    this.questionIndexSubscription = this.quizStateService.getCurrentQuestionIndex$().subscribe({
      next: (currentIndex) => {
        console.log("Current Index:", currentIndex);

        if (this.questionSubscription) {
          this.questionSubscription.unsubscribe();
        }

        this.questionSubscription = this.quizService.getCurrentQuestionByIndex(this.quizId, currentIndex).subscribe({
          next: (currentQuestion) => {
            console.log("Current Question:", currentQuestion);
            if (currentQuestion && currentQuestion.options) {
              this.numberOfCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
                currentQuestion.options
              );
              console.log("NOCA:", this.numberOfCorrectAnswers);
              this.setDisplayStateForCorrectAnswers(currentQuestion);
            } else {
              console.error('No valid current question or options available');
              this.correctAnswersTextSource.next('Error: No valid question data available.');
            }
          },
          error: (error) => {
            console.error('Error fetching current question:', error);
            this.correctAnswersTextSource.next('Error fetching current question data.');
          }
        });
      },
      error: (err) => {
        console.error('Error retrieving current question index:', err);
        this.correctAnswersTextSource.next('Error accessing question index.');
      }
    });
  }

  private async fetchAndDisplayExplanationText(question: QuizQuestion): Promise<void> {
    if (!question || !question.questionText) {
      console.error('Question is undefined or missing questionText');
      return;
    }

    try {
      const data = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(this.quizId));
      console.log("Received questions from service:", data);
      const questions: QuizQuestion[] = data;

      const questionIndex = questions.findIndex((q) =>
        q.questionText.trim().toLowerCase() === question.questionText.trim().toLowerCase()
      );
      if (questionIndex === -1) {
        console.error('Current question not found in the questions array.');
        return;
      }

      const currentQuestion = questions[questionIndex - 1];      
      // Validate the current question
      if (this.quizService.isValidQuizQuestion(currentQuestion)) {
        console.log('Setting current question:', currentQuestion);
        // Set the current question
        this.currentQuestion.next(currentQuestion);
        console.log('Updated currentQuestion observable:', this.currentQuestion.getValue());

        if (questionIndex < questions.length - 1) {
          const nextQuestion = questions[questionIndex + 1];
          if (nextQuestion) {
            this.setExplanationForNextQuestion(questionIndex + 1, nextQuestion);
            this.updateExplanationForQuestion(nextQuestion);
            // Set the explanation display state to true when a new explanation is fetched
            this.explanationTextService.setIsExplanationTextDisplayed(true);
          } else {
            console.warn('Next question not found in the questions array.');
          }
        } else {
          console.warn('Current question is the last question in the array.');
        }

        this.explanationTextService.setIsExplanationTextDisplayed(true);
      } else {
        console.error("Current question is not valid");
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    }
  }

  private setExplanationForNextQuestion(questionIndex: number, nextQuestion: QuizQuestion): void {
    const nextExplanationText = nextQuestion.explanation;
    this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, nextExplanationText);
  }

  updateExplanationForQuestion(question: QuizQuestion): void {
    // Combine explanationTextService's observable with selectedOptionExplanation$
    const explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      this.selectedOptionService.selectedOptionExplanation$,
    ]).pipe(
      map(
        ([explanationText, selectedOptionExplanation]) =>
          selectedOptionExplanation || explanationText
      )
    );

    // Subscribe to explanationText$ and update the explanation text accordingly
    explanationText$.subscribe((explanationText) => {
      if (this.quizService.areQuestionsEqual(question, this.question)) {
        this.explanationText = explanationText as string;
      } else {
        this.explanationText = null;
      }
    });
  }

  private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.combineCurrentQuestionAndOptions();
    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;
    this.formattedExplanation$ = this.explanationTextService.formattedExplanation$;

    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
      this.formattedExplanation$
    ]).pipe(
      switchMap(([currentQuestionData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation]) =>
        this.calculateCombinedQuestionData(currentQuestionData, +numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation)
      )
    );
  }

  private combineCurrentQuestionAndOptions():
    Observable<{ currentQuestion: QuizQuestion | null,
                 currentOptions: Option[] }> {
    return this.quizStateService.currentQuestion$.pipe(
      withLatestFrom(this.currentOptions$),
      map(([currentQuestion, currentOptions]) => ({
        currentQuestion, currentOptions
      }))
    );
  }

  private calculateCombinedQuestionData(
    currentQuestionData: {
      currentQuestion: QuizQuestion | null;
      currentOptions: Option[];
    },
    numberOfCorrectAnswers: number | undefined,
    isExplanationDisplayed: boolean,
    formattedExplanation: string
  ): Observable<CombinedQuestionDataType> {
    const { currentQuestion, currentOptions } = currentQuestionData;

    let correctAnswersText = '';
    if (currentQuestion && !isExplanationDisplayed && numberOfCorrectAnswers !== undefined && numberOfCorrectAnswers > 1) {
      const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswerQuestion(currentQuestion);
      if (questionHasMultipleAnswers) {
        correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
      }
    }

    const combinedQuestionData: CombinedQuestionDataType = {
      currentQuestion: currentQuestion,
      currentOptions: currentOptions,
      options: currentOptions,
      questionText: currentQuestion ? currentQuestion.questionText : '',
      explanationText: currentQuestion ? currentQuestion.explanation : '',
      formattedExplanation: formattedExplanation,
      correctAnswersText: correctAnswersText,
      isNavigatingToPrevious: this.isNavigatingToPrevious
    };

    return of(combinedQuestionData);
  }

  handleQuestionDisplayLogic(): void {
    this.combinedQuestionData$.pipe(
      takeUntil(this.destroy$),
      switchMap(combinedData => {
        if (combinedData && combinedData.currentQuestion) {
          this.currentQuestionType = combinedData.currentQuestion.type;
          return this.quizStateService.isMultipleAnswerQuestion(combinedData.currentQuestion).pipe(
            map(isMultipleAnswer => ({
              combinedData,
              isMultipleAnswer
            }))
          );
        } else {
          this.currentQuestionType = undefined;
          return of({ combinedData, isMultipleAnswer: false });
        }
      })
    ).subscribe(({ combinedData, isMultipleAnswer }) => {
      if (this.currentQuestionType === QuestionType.SingleAnswer) {
        this.shouldDisplayCorrectAnswers = false;
      } else {
        this.shouldDisplayCorrectAnswers = isMultipleAnswer;
      }
    });
  }

  private setupCombinedTextObservable(): void {
    this.combinedText$ = combineLatest([
      this.nextQuestion$.pipe(startWith(null)),
      this.previousQuestion$.pipe(startWith(null)),
      this.explanationTextService.formattedExplanation$.pipe(startWith('')),
      this.explanationTextService.shouldDisplayExplanation$,
      this.quizStateService.getCurrentQuestionIndex$().pipe(startWith(0))
    ]).pipe(
      switchMap(params => this.determineTextToDisplay(params)),
      distinctUntilChanged(),
      startWith(''),
      catchError((error: Error) => {
        console.error('Error in combinedText$ observable:', error);
        return of('');
      })
    );
  }

  private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation, currentIndex]:
    [QuizQuestion | null, QuizQuestion | null, string, boolean, number]
  ): Observable<string> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, currentIndex);
  
    // Display explanation for the first question or based on questionState's properties
    const displayExplanation = currentIndex === 0 || (shouldDisplayExplanation && questionState?.explanationDisplayed);
  
    return this.isCurrentQuestionMultipleAnswer().pipe(
      map(isMultipleAnswer => {
        let textToDisplay = '';
  
        // Use the displayExplanation condition to determine when to show formattedExplanation
        if (displayExplanation && formattedExplanation) {
          textToDisplay = formattedExplanation;
          this.shouldDisplayCorrectAnswers = false;
        } else {
          textToDisplay = this.questionToDisplay || '';
          this.shouldDisplayCorrectAnswers = !displayExplanation && isMultipleAnswer;
        }
  
        return textToDisplay;
      })
    );
  }
  
  
  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap((question: QuizQuestion) =>
        question ? this.quizStateService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }

  private setDisplayStateForCorrectAnswers(question: QuizQuestion | null): void {
    console.log('Setting display state for correct answers with question:', question);
    if (!question || !question.options || !Array.isArray(question.options)) {
      console.error('Invalid question or options:', question);
      this.correctAnswersTextSource.next('');
      this.correctAnswersDisplaySubject.next(false);
      this.shouldDisplayCorrectAnswers = false;
      return;
    }

    this.quizStateService.isMultipleAnswerQuestion(question).subscribe({
      next: (isMultipleAnswer) => {
        console.log("IMA:", isMultipleAnswer);
        console.log("Question options after subscription:", question.options);

        if (isMultipleAnswer) {
          const numberOfCorrectAnswers = question.options.filter(option => option.correct).length;
          console.log(`Number of correct answers: ${numberOfCorrectAnswers}`);
          this.shouldDisplayCorrectAnswers = true;
          this.correctAnswersTextSource.next(`(${numberOfCorrectAnswers} answers are correct)`);
          this.correctAnswersDisplaySubject.next(true);
        } else {
          this.correctAnswersTextSource.next(''); // Clear text for single-answer questions
          this.correctAnswersDisplaySubject.next(false);
          this.shouldDisplayCorrectAnswers = false;
        }
      },
      error: (err) => {
        console.error("Error determining if multiple answer question:", err);
        this.correctAnswersTextSource.next('');
        this.correctAnswersDisplaySubject.next(false);
        this.shouldDisplayCorrectAnswers = false;
      }
    });
  }

  private updateCorrectAnswersDisplay(question: QuizQuestion | null): Observable<void> {
    if (!question) {
      return of(void 0);
    }

    console.log('Evaluating question:', question);

    return this.quizStateService.isMultipleAnswerQuestion(question).pipe(
      tap(isMultipleAnswer => {
        const correctAnswers = question.options.filter(option => option.correct).length;
        const newCorrectAnswersText = isMultipleAnswer
          ? `(${correctAnswers} answers are correct)`
          : '';

        console.log('Current correctAnswersTextSource:', this.correctAnswersTextSource.getValue());
        console.log('New correctAnswersText:', newCorrectAnswersText);
        console.log('isMultipleAnswer:', isMultipleAnswer);
        console.log('correctAnswers:', correctAnswers);

        if (this.correctAnswersTextSource.getValue() !== newCorrectAnswersText) {
          console.log(`Updating correctAnswersTextSource from '${this.correctAnswersTextSource.getValue()}' to '${newCorrectAnswersText}'`);
          this.correctAnswersTextSource.next(newCorrectAnswersText);
        }

        const shouldDisplayCorrectAnswers = isMultipleAnswer && !this.isExplanationDisplayed;
        console.log('Current shouldDisplayCorrectAnswers:', this.shouldDisplayCorrectAnswersSubject.getValue());
        console.log('New shouldDisplayCorrectAnswers:', shouldDisplayCorrectAnswers);

        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
          console.log(`Updating shouldDisplayCorrectAnswersSubject from '${this.shouldDisplayCorrectAnswersSubject.getValue()}' to '${shouldDisplayCorrectAnswers}'`);
          this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
        }

        console.log('Update: ', {
          question,
          isMultipleAnswer,
          correctAnswers,
          newCorrectAnswersText,
          shouldDisplayCorrectAnswers,
        });
      }),
      map(() => void 0)
    );
  }

  private logCurrentQuestion(question: QuizQuestion | null) {
    console.log('currentQuestion updated:', question);
  }

  private updateCorrectAnswersDisplayState(): void {
    this.isCurrentQuestionMultipleAnswer().subscribe(isMultiple => {
      const shouldDisplayCorrectAnswers = isMultiple && !this.isExplanationDisplayed;
      this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
      console.log(`shouldDisplayCorrectAnswers: ${shouldDisplayCorrectAnswers}`);
    });
  }

  updateQuizStatus(): void {
    this.questionText = this.question.questionText;
    this.correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
    this.quizService.updateQuestionText(this.questionText);
    this.quizService.updateCorrectAnswersText(this.correctAnswersText);
  }
}
