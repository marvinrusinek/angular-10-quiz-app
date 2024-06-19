import { ChangeDetectionStrategy, ChangeDetectorRef, Component,
  EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit,
  Output, SimpleChange, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, lastValueFrom, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, take, takeUntil, tap } from 'rxjs/operators';

import { Utils } from '../../shared/utils/utils';
import { AudioItem } from '../../shared/models/AudioItem.model';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() toggleVisibility: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionClicked: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionSelected: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() questionAnswered = new EventEmitter<boolean>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() explanationToDisplayChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() showExplanationChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Input() data: {
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    options: Option[];
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex: number = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() explanationText: string | null;
  @Input() isOptionSelected = false;
  @Input() showFeedback = false;

  @Input() selectionMessage: string;
  @Output() selectionMessageChange = new EventEmitter<string>();
  @Output() isAnsweredChange = new EventEmitter<boolean>();
  @Output() isAnswered = false;

  combinedQuestionData$: Subject<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> = new Subject();

  questionIndex: number;
  questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
  selectedOption: Option | null;
  selectedOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  options$: Observable<Option[]>;
  quiz: Quiz;
  questionsArray: QuizQuestion[] = [];
  questionsObservableSubscription: Subscription;
  currentQuestionSubscription: Subscription;
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz = new ReplaySubject<Quiz>(1);
  totalQuestions: number;
  currentOptions: Option[] | undefined;
  correctAnswers: number[] | undefined;
  correctMessage: string;
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers: any[] = [];
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  explanationText$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  correctAnswersLoaded = false;
  sharedVisibilitySubscription: Subscription;
  isExplanationTextDisplayed = false;
  isNavigatingToPrevious = false;
  isLoading = true;
  isLoadingQuestions = false;
  isPaused = false;
  isInitialized = false;
  isComponentDestroyed = false;
  private initialized = false;
  private isNextMessage = false;
  private isFirstQuestion = true;
  private selectionUpdate$ = new Subject<boolean>();
  private lastMessage = '';
  private selectionMessageSubject: BehaviorSubject<string> = new BehaviorSubject<string>('Please start the quiz by selecting an option.');

  // Define audio list array
  audioList: AudioItem[] = [];

  // Correct and incorrect audio sources
  correctAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-correct.mp3',
    title: 'Correct Answer'
  };
  incorrectAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-incorrect.mp3',
    title: 'Incorrect Answer'
  };

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected explanationTextService: ExplanationTextService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected timerService: TimerService,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router,
    protected ngZone: NgZone
  ) {
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.quizQuestionManagerService = quizQuestionManagerService;
    this.explanationTextService = explanationTextService;
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;

    this.questionForm = this.fb.group({
      selectedOption: ['']
    });

    /* this.sharedVisibilitySubscription =
      this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
        this.handlePageVisibilityChange(isHidden);
      }); */

    this.quizService.getIsNavigatingToPrevious()
      .subscribe(
        (isNavigating) => (this.isNavigatingToPrevious = isNavigating)
      );

      this.quizService.getTotalQuestions()
      .pipe(takeUntil(this.destroy$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });

      this.selectionUpdate$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(isAnswered => {
        this.updateSelectionMessage(this.isAnswered);
      });
  }

  async ngOnInit(): Promise<void> {
    console.log('QuizQuestionComponent - ngOnInit - Initializing');
  
    // Consolidate and simplify message-related calls
    this.resetMessages();
    this.setInitialMessage();
    this.updateSelectionMessageForCurrentQuestion(true); // Pass 'true' to handle initial state
  
    // Ensure the quiz is initialized only once
    if (!this.initialized) {
      await this.initializeQuiz();
    }
  
    // Initialize the current quiz question
    this.initializeQuizQuestion();
    this.checkIfAnswerSelected(true); // Pass 'true' to handle initial check
  
    // Set up event listener for visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.ngZone.run(() => {
          this.fetchAndProcessQuizQuestions();
        });
      }
    });
  
    // Subscribe to option selection state changes
    this.subscribeToOptionSelection();
  
    // Log initial and final data for debugging
    this.logInitialData();
    this.logFinalData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Improved check for property changes that are not the first change
    const isSubsequentChange = (change: SimpleChange) => change && !change.firstChange;
    
    // Handling changes to correctAnswers or selectedOptions
    if (isSubsequentChange(changes.correctAnswers) || isSubsequentChange(changes.selectedOptions)) {
      // Ensure question is defined before calling getCorrectAnswers
      if (this.currentQuestion) {
        this.getCorrectAnswers();
        this.correctMessage = this.quizService.setCorrectMessage(
          this.quizService.correctAnswerOptions,
          this.data.options
        );
      } else {
        console.warn('QuizQuestionComponent - ngOnChanges - Question is undefined when trying to get correct answers.');
      }
      this.cdRef.detectChanges();
    }
  
    // Handling changes to the question
    if (isSubsequentChange(changes.currentQuestion)) {
      // console.log('QuizQuestionComponent - ngOnChanges - Question changed:', this.question);
      if (this.currentQuestion) {
        this.quizService.handleQuestionChange(
          this.currentQuestion,
          isSubsequentChange(changes.selectedOptions) ? changes.selectedOptions.currentValue : null,
          this.options
        );

        // Rebuild the form whenever the question changes
        this.buildForm();
      } else {
        console.warn('QuizQuestionComponent - ngOnChanges - Question is undefined after change.');
      }
    } else if (isSubsequentChange(changes.selectedOptions)) {
      // If only selectedOptions changes, not triggered by question change
      this.quizService.handleQuestionChange(
        null,
        changes.selectedOptions.currentValue,
        this.options
      );
    }
  }
  
  ngOnDestroy(): void {
    this.isComponentDestroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
  }

  private safeDetectChanges(): void {
    if (!this.isComponentDestroyed) {
      this.cdRef.detectChanges();
    } else {
      console.warn('Attempted to call detectChanges on a destroyed view.');
    }
  }

  trackByOption(option: Option): number {
    return option.optionId;
  }

  private buildForm(): void {
    this.questionForm = this.fb.group({
      answer: ['', Validators.required]
    });
  }

  public get shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  public get shouldDisplayOptions(): boolean {
    return this.data?.options && this.data.options.length > 0;
  }

  public shouldHideOptions(): boolean {
    return !this.data?.options || this.data.options.length === 0;
  }

  handleQuestionUpdate(newQuestion: QuizQuestion): void {
    if (!newQuestion.selectedOptions) {
      newQuestion.selectedOptions = [];
    }

    this.getCorrectAnswers();
  }

  private async initializeQuiz(): Promise<void> {
    this.initialized = true;
    this.initializeSelectedQuiz();
    await this.initializeQuizQuestionsAndAnswers();
  }
  
  // might need later
  private subscribeToAnswers(): void {
    this.quizService.answers$.subscribe((answers) => {
      this.answers = answers;
    });
  }

  private handlePageVisibilityChange(isHidden: boolean): void {
    if (isHidden) {
      // Page is now hidden, pause or delay updates in this component
      this.isPaused = true; // pause updates
    } else {
      // Page is now visible, resume updates in this component
      this.isPaused = false; // Unpause updates
      this.prepareAndSetExplanationText(this.currentQuestionIndex);
    }
  }

  public getDisplayOptions(): Option[] {
    return this.optionsToDisplay && this.optionsToDisplay.length > 0
      ? this.optionsToDisplay : this.data?.options;
  }

  // logging undefined...
  private logInitialData(): void {
    console.log('this.questionData:', this.questionData);
  }

  private initializeSelectedQuiz(): void {
    if (this.quizDataService.selectedQuiz$) {
      this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
        this.selectedQuiz.next(quiz);
        this.setQuestionOptions();
      });
    }
  }

  private initializeQuizQuestion(): void {
    if (!this.quizStateService.getQuizQuestionCreated()) {
      this.quizStateService.setQuizQuestionCreated();

      this.questionsObservableSubscription = this.quizService
        .getAllQuestions()
        .pipe(
          map((questions: QuizQuestion[]) => {
            questions.forEach((quizQuestion: QuizQuestion) => {
              quizQuestion.selectedOptions = null;
            });
            return questions;
          })
        )
        .subscribe();
    }
  }

  private async initializeQuizQuestionsAndAnswers(): Promise<void> {
    try {
      await this.fetchAndProcessQuizQuestions();
      this.subscribeToCorrectAnswersAndData();
  
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
      if (this.quizId) {
        await this.quizDataService.asyncOperationToSetQuestion(
          this.quizId, this.currentQuestionIndex
        );
      } else {
        console.error('Quiz ID is empty after initialization.');
      }
      
      // this.initializeCorrectAnswerOptions();
      // this.subscribeToCorrectAnswers();
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  private async fetchAndProcessQuizQuestions(): Promise<void> {
    this.isLoading = true;
  
    try {
      const questions = await this.quizService.fetchQuizQuestions();
  
      if (questions && questions.length > 0) {
        this.questions = of(questions);
  
        // Update component's state with the fetched questions
        // Display explanation texts for previously answered questions
        questions.forEach((question, index) => {
          const state = this.quizStateService.getQuestionState(this.quizId, index);
          if (state?.isAnswered) {
            const formattedExplanationText: FormattedExplanation = {
              questionIndex: index,
              explanation: this.explanationTextService.getFormattedExplanationTextForQuestion(index)
            };
            this.explanationTextService.formattedExplanations[index] = formattedExplanationText;
          }
        });
      } else {
        console.error('No questions were loaded');
      }
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      this.isLoading = false;
    }
  
    this.cdRef.detectChanges();
  }

  /* private initializeCorrectAnswerOptions(): void {
    this.quizService.setCorrectAnswerOptions(this.correctAnswers);
  } */

  /* private async subscribeToCorrectAnswersAndData(): Promise<void> {
    combineLatest([
      this.quizService.correctAnswers$,
      this.quizService.combinedQuestionData$.pipe(
        filter((data) => data !== null)
      ),
    ])
      .pipe(take(1))
      .subscribe(([correctAnswers, data]) => {
        console.log(
          'Subscription triggered with correctAnswers:',
          correctAnswers
        );
        console.log('Subscription triggered with data:', data);

        if (data !== null) {
          this.data = {
            questionText: data.questionText,
            explanationText:
              ((data as any) && (data as any).explanationText) || '',
            correctAnswersText: data.correctAnswersText,
            options: data.currentOptions
          };

          this.correctAnswers = correctAnswers.get(data.questionText);
          this.currentOptions = data.currentOptions;

          console.log('currentOptions:', this.currentOptions);
          console.log('correctAnswers:', this.correctAnswers);

          // Update combinedQuestionDataSubject with question data
          if (
            this.data.questionText &&
            this.data.correctAnswersText &&
            this.data.options
          ) {
            this.quizService.combinedQuestionDataSubject.next({
              questionText: this.data.questionText,
              correctAnswersText: '',
              currentOptions: this.data.options,
              currentQuestion: this.currentQuestion,
              isNavigatingToPrevious: this.isNavigatingToPrevious
            });
          }
          console.log('CA:', this.correctAnswers);
          if (this.currentOptions && this.correctAnswers) {
            console.log('Current options and correct answers are available.');
            this.setCorrectMessage(this.correctAnswers);
            this.updateCorrectMessageText(this.correctMessage);
          } else {
            console.log(
              'Current options and/or correct answers are not available.'
            );
            this.correctMessage = 'The correct answers are not available yet.';
            this.updateCorrectMessageText(this.correctMessage); // Update with the error message
          }

          await this.fetchCorrectAnswersAndText(this.data, this.data.options);

          if (this.currentOptions && this.correctAnswers) {
            const correctAnswerOptions: Option[] = this.correctAnswers
              .map((answerId) =>
                this.currentOptions.find(
                  (option) => option.optionId === answerId
                )
              )
              .filter((option) => option !== undefined) as Option[];

            this.quizService.setCorrectAnswerOptions(correctAnswerOptions); 
          }

          this.updateQuestionForm();
        } else {
          console.log(
            'Data is not available. Cannot call fetchCorrectAnswersText.'
          );
          this.correctMessage = 'The correct answers are not available yet...';
          this.updateCorrectMessageText(this.correctMessage); // Update with the error message
        }
      });
  } */

  private async subscribeToCorrectAnswersAndData(): Promise<void> {
    try {
      await this.fetchCorrectAnswersAndText(this.data, this.data.options); // Initialize data
    } catch (error) {
      console.error('Error in subscribeToCorrectAnswersAndData:', error);
    }
  }  

  private subscriptionToOptions(): void {
    this.quizService.currentOptions$.subscribe((options) => {
      if (options) {
        this.options = options;
      }
    });
  }

  // Subscribe to option selection changes
  private subscribeToOptionSelection(): void {
    this.selectedOptionService.isOptionSelected$
      .pipe(
        debounceTime(300), // Debounce to prevent rapid changes
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((isSelected: boolean) => {
        this.updateSelectionMessageForCurrentQuestion();
      });
  }
  

  updateCorrectMessageText(message: string): void {
    this.quizService.updateCorrectMessageText(message); 
  }

  private logFinalData(): void {
    const data = {
      questionText: this.data.questionText,
      correctAnswersText: this.data.correctAnswersText || '',
      currentOptions: this.data.options
    };
    console.log('Data to be passed to fetchCorrectAnswersText:', data);
    console.log('questionData:::', this.questionData);
    // console.log('data:::', this.data); // this works correctly
    console.log('data.currentOptions:::', this.data.options);
    console.log('MY CORR MSG', this.correctMessage);
  }

  private async fetchCorrectAnswersAndText(
    data: any,
    currentOptions: Option[]
  ): Promise<void> {
    try {
      console.log('fetchCorrectAnswersAndText called with data:', data);
      console.log('Current Options:', currentOptions);
  
      if (!currentOptions || currentOptions.length === 0) {
        console.error('currentOptions is undefined or empty:', currentOptions);
        throw new Error('Options array is undefined or empty.');
      }
  
      // Fetch the correct answers if they are not already available
      const currentCorrectAnswers = this.quizService.correctAnswers.get(data.questionText);
      if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
        await firstValueFrom(this.quizService.setCorrectAnswers(this.currentQuestion, currentOptions));
        this.correctAnswers = this.quizService.correctAnswers.get(data.questionText);
      }
  
      // Fetch the correct answers text or update it with the correct message
      await this.fetchCorrectAnswersText(data, currentOptions);
      console.log('After fetchCorrectAnswersText...');
      console.log('MY CORR MSG:', this.correctMessage);
    } catch (error) {
      console.error('Error in fetchCorrectAnswersAndText:', error);
    }
  }

  getOptionsForQuestion(): Option[] {
    return this.currentQuestionIndex === this.previousQuestionIndex
      ? this.optionsToDisplay
      : this.data?.options;
  }

  updateQuestionForm(): void {
    // Fetch the correct answers and update the correct message
    this.getCorrectAnswers();
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      this.correctAnswers = correctAnswers.get(this.data.questionText);
    });

    // Update other form-related logic
    this.updateCorrectAnswers();
    this.resetForm();
  }

  private subscribeToCorrectMessage(): void {
    this.quizService.correctMessage$.subscribe((message) => {
      console.log('Correct Message Updated:', message);
      this.correctMessage = message;
    });
  }

  isOption(option: Option | string): option is Option {
    return (option as Option).optionId !== undefined;
  }

  subscriptionToQuestion(): void {
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        tap((question: QuizQuestion | null) => {
          if (question) {
            this.currentQuestion = question;
            this.options = question.options;
          }
        }),
        catchError((error: Error) => {
          console.error('Error in currentQuestion$ subscription:', error);
          return of(null);
        })
      )
      .subscribe();
  }

  public incrementScore(): void {
    this.quizService.score++;
  }

  public getCorrectAnswers(): number[] {
    // Check if the current question index has changed to decide whether to fetch new answers
    if (this.currentQuestionIndex !== this.previousQuestionIndex) {
      try {
        // Fetch correct answers from the service
        this.correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
        // Update previousQuestionIndex after fetching
        this.previousQuestionIndex = this.currentQuestionIndex;
      } catch (error) {
        console.error('QuizQuestionComponent - Error getting correct answers:', error);
        this.correctAnswers = [];
      }
    }
  
    return this.correctAnswers;
  }  

  private updateCorrectAnswers(): void {
    console.log('Current Options:::>>>', this.data.options);
    if (this.data && this.data.options) {
      this.correctAnswers = this.data.options
        .filter((option) => option.correct)
        .map((option) => option.value);
      console.log('Correct Answers::>>', this.correctAnswers);
    }
  }

  public setCorrectMessage(correctAnswers: number[]): void {
    this.quizService.correctAnswersLoadedSubject.subscribe(
      (loaded: boolean) => {
        if (loaded) {
          if (this.data && this.data.options && this.data.options.length > 0) {
            if (correctAnswers && correctAnswers.length > 0) {
              if (!this.correctMessage) {
                try {
                  this.correctMessage = this.quizService.setCorrectMessage(
                    this.quizService.correctAnswerOptions,
                    this.data.options
                  );
                } catch (error) {
                  console.error(
                    'An error occurred while updating the correct message:',
                    error
                  );
                }
              }
            } else {
              this.correctMessage =
                'No correct answers found for the current question.';
            }
          }
        } else {
          this.correctMessage = 'The correct answers are not available yet.';
        }
      }
    );
  }

  /* setCorrectMessage(correctAnswerOptions, options): void {
    // if (this.correctAnswers && this.currentOptions) {
    this.correctMessage = this.quizService.setCorrectMessage(correctAnswerOptions, options);
    console.log('MY CORR MSG:::>>>', this.correctMessage);
    // }
  } */

  /* private subscribeToCorrectAnswers(): void {
    this.quizService.correctAnswers$.subscribe((correctAnswers) => {
      const currentCorrectAnswers = correctAnswers.get(this.question.questionText);

      if (currentCorrectAnswers && currentCorrectAnswers.length > 0) {
        this.correctAnswers = currentCorrectAnswers;
        this.setCorrectMessage();
      } else {
        this.correctMessage = 'No correct answers found for the current question.';
      }
    });
  } */

  async fetchCorrectAnswersText(
    data: any,
    currentOptions: Option[]
  ): Promise<void> {
    console.log('Fetching correct answer text...');
    console.log('Data:', data);

    // Map option IDs to Option objects
    const mappedCorrectAnswerOptions: Option[] = [];

    for (const optionId of this.quizService.correctAnswerOptions) {
      const foundOption = currentOptions.find((option) => {
        return option.optionId === Number(optionId);
      });

      if (foundOption !== undefined) {
        mappedCorrectAnswerOptions.push(foundOption);
      }
    }

    console.log('Mapped correct answer options:', mappedCorrectAnswerOptions);

    this.correctMessage = this.quizService.setCorrectMessage(
      mappedCorrectAnswerOptions,
      currentOptions
    );
    console.log('MY CORR MSG', this.correctMessage);

    /* this.correctAnswers = this.quizService.getCorrectAnswersForQuestion(
      data.questionText
    ); // not a function */

    // Call the isMultipleAnswer function to determine if the question is a multiple-answer question
    data.isMultipleAnswer = await firstValueFrom(this.quizStateService.isMultipleAnswerQuestion(this.question));
  }

  setQuestionOptions(): void {
    this.selectedQuiz
      .pipe(
        take(1),
        filter((quiz) => !!quiz),
        map((quiz) => quiz.questions[this.currentQuestionIndex])
      )
      .subscribe((currentQuestion: QuizQuestion) => {
        if (!currentQuestion) {
          console.error('Question not found');
          return;
        }

        this.currentQuestion = currentQuestion;
        this.currentOptions = currentQuestion.options;

        const { options, answer } = currentQuestion;
        const answerValue = answer?.values().next().value;
        this.correctOptionIndex = options.findIndex(
          (option) => option.value === answerValue
        );

        this.currentOptions = options.map(
          (option, index) =>
            ({
              text: option.text,
              correct: index === this.correctOptionIndex,
              value: option.value,
              answer: option.value,
              selected: false
            } as Option)
        );

        // Shuffle options only if the shuffleOptions boolean is true
        if (this.shuffleOptions) {
          Utils.shuffleArray(this.currentOptions);
        }
      });
  }

  private resetForm(): void {
    if (!this.questionForm) {
      return;
    }

    this.questionForm.patchValue({ answer: '' });
    this.alreadyAnswered = false;
  }

  // not being used
  /* private clearSelection(): void {
    if (this.correctAnswers && this.correctAnswers.length === 1) {
      if (this.currentQuestion && this.currentQuestion.options) {
        this.currentQuestion.options.forEach((option) => {
          option.selected = false;
          option.styleClass = '';
        });
      }
    }
  } */

  async onOptionClicked(option: SelectedOption, index: number): Promise<void> {
    try {
      // Toggle the selection of the option
      const selectedOption: SelectedOption = {
        optionId: option.optionId,
        questionIndex: this.currentQuestionIndex,
        text: option.text
      };
      this.quizService.toggleSelectedOption(selectedOption);
  
      // Check if the current question is answered after an option is selected
      await this.checkIfAnswerSelected(this.isFirstQuestion);
      this.isFirstQuestion = false; // Reset after the first option click
  
      // Process the current question
      const currentQuestion = await this.fetchCurrentQuestion();
      if (!currentQuestion) {
        console.error('Could not retrieve the current question.');
        return;
      }
  
      // Only update the message after an option has been clicked
      const isAnswered = true;
      this.updateAnswerStateAndMessage(isAnswered);
  
      // Handle additional option selection logic
      await this.processCurrentQuestion(currentQuestion);
      this.handleOptionSelection(option, index, currentQuestion);
      this.selectedOptionService.setOptionSelected(true);
  
      // Update state for explanations and log them
      this.updateQuestionStateForExplanation(this.currentQuestionIndex);
      this.formatAndLogExplanations();
  
      // Emit the event that the question has been answered
      this.questionAnswered.emit();
  
      // Handle correctness check and timer
      await this.handleCorrectnessAndTimer();

      this.updateSelectionMessageForCurrentQuestion();
    } catch (error) {
      console.error('An error occurred while processing the option click:', error);
    }
  }
  
  private async fetchCurrentQuestion() {
    try {
      const currentQuestion = await firstValueFrom(this.quizService.getCurrentQuestion());
      if (!currentQuestion) {
        console.error('Could not retrieve the current question.');
        return null;
      }
      return currentQuestion;
    } catch (error) {
      console.error('Error fetching the current question:', error);
      return null;
    }
  }

  private updateAnswerStateAndMessage(isAnswered: boolean): void {
    const message = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered
    );
    console.log('[updateAnswerStateAndMessage] Determined message:', message);
    this.setSelectionMessageIfChanged(message);
  }

  // Sets the selection message if it has changed
  private setSelectionMessageIfChanged(newMessage: string): void {
    console.log(`[setSelectionMessageIfChanged] Current message: '${this.lastMessage}', New message: '${newMessage}'`);
    if (this.lastMessage !== newMessage) {
      console.log(`[setSelectionMessageIfChanged] Updating message from '${this.lastMessage}' to '${newMessage}'`);
      this.setSelectionMessage(newMessage); // Call the method to update the message in the service
      this.lastMessage = newMessage;
      this.safeDetectChanges();
    } else {
      console.log('[setSelectionMessageIfChanged] No change in message. Skipping update.');
    }
  }

  private setSelectionMessage(message: string): void {
    console.log(`[setSelectionMessage] Updating selection message to: ${message}`);
    this.selectionMessageService.updateSelectionMessage(message);
  }
  

  private async handleCorrectnessAndTimer(): Promise<void> {
    // Check if the answer is correct and stop the timer if it is
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    if (isCorrect) {
      this.timerService.stopTimer();
    }
    // Handle audio playback based on whether the answer is correct
    this.handleAudioPlayback(isCorrect);
  }

  // Determine and set the selection message based on the current question
  private updateSelectionMessageForCurrentQuestion(isInitial: boolean = false): void {
    let newMessage = '';
  
    if (isInitial && this.currentQuestionIndex === 0) {
      // Display initial message for the first question
      newMessage = 'Please start the quiz by selecting an option.';
    } else if (this.currentQuestionIndex === this.totalQuestions - 1) {
      newMessage = 'Please click the Show Results button.';
    } else {
      const isOptionSelected = this.selectedOptionService.getCurrentOptionSelectedState();
      newMessage = isOptionSelected
        ? 'Please click the next button to continue...'
        : 'Please select an option to continue...';
    }
  
    // Update message only if it has changed
    this.setSelectionMessageIfChanged(newMessage);
  }
  

  private setInitialMessage(): void {
    const initialMessage = 'Please start the quiz by selecting an option.';
    console.log('[setInitialMessage] Setting initial message:', initialMessage);
    this.selectionMessageService.updateSelectionMessage(initialMessage);
    this.lastMessage = initialMessage;
    this.safeDetectChanges();
  }

  private initializeSelectionMessage(): void {
    if (this.currentQuestionIndex === 0) {
      // For the first question
      this.setSelectionMessage('Please start the quiz by selecting an option.');
    } else {
      // For subsequent questions
      this.setSelectionMessage('Please select an option to continue...');
    }
  }

  private resetMessages(): void {
    this.selectionMessageService.resetMessage();
    this.lastMessage = 'Please start the quiz by selecting an option.';
    console.log('[resetMessages] Messages reset to initial state');
  }

  private async checkIfAnswerSelected(isFirstQuestion: boolean = false): Promise<void> {
    if (isFirstQuestion) {
      this.setInitialMessage();
      console.log('[checkIfAnswerSelected] Initial message set for the first question');
      return;
    }
  
    const isAnswered = await lastValueFrom(this.quizService.isAnswered(this.currentQuestionIndex));
    console.log(`[checkIfAnswerSelected] Question ${this.currentQuestionIndex} is answered:`, isAnswered);
    if (!isAnswered) {
      const preSelectMessage = 'Please select an option to continue...';
      console.log('[checkIfAnswerSelected] Setting pre-selection message:', preSelectMessage);
      this.setSelectionMessageIfChanged(preSelectMessage);
    } else {
      console.log('[checkIfAnswerSelected] Updating answer state and message');
      this.updateAnswerStateAndMessage(isAnswered);
    }
  }

  private updateSelectionMessage(isAnswered: boolean): void {
    const isLastQuestion = this.currentQuestionIndex === this.totalQuestions - 1;
    let newMessage: string;
  
    if (isLastQuestion) {
      newMessage = isAnswered ? 'Please click the Show Results button.' : 'Please select an option to continue...';
    } else if (this.isFirstQuestion) {
      newMessage = isAnswered ? 'Please click the next button to continue.' : 'Please start the quiz by selecting an option.';
    } else {
      newMessage = isAnswered ? 'Please click the next button to continue.' : 'Please select an option to continue...';
    }
  
    if (this.lastMessage !== newMessage) {
      this.selectionMessageService.updateSelectionMessage(newMessage);
      this.selectionMessage = newMessage;
      this.lastMessage = newMessage;
      this.safeDetectChanges();
    }
  }
  
  private async processCurrentQuestion(
    currentQuestion: QuizQuestion
  ): Promise<void> {
    this.explanationTextService.setShouldDisplayExplanation(true);

    const explanationText =
      await firstValueFrom(
        of(this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex))
      );
    this.explanationTextService.setCurrentQuestionExplanation(explanationText);

    const totalCorrectAnswers = this.quizService.getTotalCorrectAnswers(currentQuestion);
    this.quizStateService.updateQuestionState(
      this.quizId,
      this.currentQuestionIndex,
      { isAnswered: true },
      totalCorrectAnswers
    );
  }

  updateQuestionStateForExplanation(index: number): void {
    let questionState = this.quizStateService.getQuestionState(
      this.quizId,
      index
    );

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
    this.quizStateService.setQuestionState(this.quizId, index, questionState);
  }

  private formatAndLogExplanations(): void {
    const explanations = this.explanationTextService.getFormattedExplanations();
    console.log('Formatted Explanations on click:', explanations);
  }
  

  updateExplanationText(questionIndex: number): void {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (questionState.isAnswered) {
      const explanationText =
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );
      this.explanationToDisplayChange.emit(explanationText); // Emit the explanation text
      this.showExplanationChange.emit(true); // Emit the flag to show the explanation
    } else {
      this.explanationToDisplayChange.emit(''); // Clear the explanation text
      this.showExplanationChange.emit(false); // Emit the flag to hide the explanation
    }
  }

  handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
        this.audioList = [...this.audioList, this.correctAudioSource];
    } else {
        this.audioList = [...this.audioList, this.incorrectAudioSource];
    }

    // Use a new array to trigger change detection
    setTimeout(() => {
        this.audioList = [];
    }, 1000);  // Ensure audio has time to play before clearing
  }

  async handleOptionSelection(
    option: SelectedOption,
    index: number,
    currentQuestion: QuizQuestion
  ): Promise<void> {
    this.processOptionSelection(currentQuestion, option, index);
    this.quizService.updateAnswersForOption(option);
    this.checkAndHandleCorrectAnswer();
    this.logDebugInformation();

    const totalCorrectAnswers = this.quizService.getTotalCorrectAnswers(currentQuestion);
    // Update the state to reflect the selected option
    this.quizStateService.updateQuestionState(
      this.quizId,
      this.currentQuestionIndex,
      {
        selectedOptions: [option],
        isCorrect: option.correct ?? false
      },
      totalCorrectAnswers
    );

    // Decide whether to show the explanation based on the current question index
    await firstValueFrom(of(this.conditionallyShowExplanation(this.currentQuestionIndex)));
  }

  private processOptionSelection(
    currentQuestion: QuizQuestion,
    option: SelectedOption, 
    index: number
  ): void {
    this.handleOptionClicked(currentQuestion, index);

    // Check if the clicked option is selected
    const isOptionSelected = this.quizQuestionManagerService.isSelectedOption(option);

    // Set shouldDisplayExplanation to true when an option is selected, otherwise set it to false
    this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
    this.explanationTextService.toggleExplanationDisplay(isOptionSelected);
  }

  private logDebugInformation(): void {
    console.log('Answers:', this.answers);
  }

  private async checkAndHandleCorrectAnswer(): Promise<void> {
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    console.log('ISCORRECT', isCorrect);

    if (isCorrect) {
      // Stop the timer and provide an empty callback
      this.timerService.stopTimer(() => {
        console.log('Correct answer selected!');
        // add additional logic here
      });
    }
  }

  conditionallyShowExplanation(questionIndex: number): void {
    this.quizDataService
      .getQuestionsForQuiz(this.quizService.quizId)
      .pipe(
        catchError((error: Error) => {
          console.error('There was an error loading the questions', error);
          return of([]);
        })
      )
      .subscribe((data: QuizQuestion[]) => {
        this.handleQuestionData(data, questionIndex);
      });
  }
  
  private handleQuestionData(data: QuizQuestion[], questionIndex: number): void {
    this.questionsArray = data;
  
    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.warn('Questions array is not initialized or empty.');
      return;
    }
  
    if (questionIndex < 0 || questionIndex >= this.questionsArray.length) {
      console.error(`Invalid questionIndex: ${questionIndex}`);
      return;
    }
  
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );
    // console.log('Question State:', questionState);
    if (questionState && questionState.isAnswered) {
      const explanationText =
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );
      this.explanationTextService.setExplanationText(explanationText);
      this.explanationTextService.setShouldDisplayExplanation(true);
    } else {
      console.log(`Conditions for showing explanation not met.`);
    }
  }
  
  handleOptionClicked(currentQuestion: QuizQuestion, optionIndex: number): void {
    const selectedOptions = this.quizService.getSelectedOptionIndices(this.currentQuestionIndex);
    const isOptionSelected = selectedOptions.includes(optionIndex);
  
    if (!isOptionSelected) {
      this.quizService.addSelectedOptionIndex(this.currentQuestionIndex, optionIndex);
    } else {
      this.quizService.removeSelectedOptionIndex(this.currentQuestionIndex, optionIndex);
    }
  
    const updatedSelectedOptions = this.quizService.getSelectedOptionIndices(this.currentQuestionIndex);
  
    this.handleMultipleAnswer(currentQuestion);
  
    const isAnswered = updatedSelectedOptions.length > 0;
    this.updateSelectionMessage(isAnswered);
    this.cdRef.markForCheck(); // Ensure Angular change detection picks up state changes
  }  

  private handleMultipleAnswer(currentQuestion: QuizQuestion): void {
    this.quizStateService.isMultipleAnswerQuestion(currentQuestion).subscribe({
      next: () => {
        if (this.quizService.selectedOptions.length > 0) {
          this.fetchQuestionsArray(currentQuestion);
        } else {
          this.explanationText$.next('');
        }
      },
      error: (error) => {
        console.error('Error in isMultipleAnswer subscription:', error);
      },
    });
  }

  private fetchQuestionsArray(currentQuestion: QuizQuestion): void {
    this.isLoadingQuestions = true;
    this.questions.pipe(take(1)).subscribe({
      next: (questionsArray: QuizQuestion[]) => {
        if (!questionsArray || questionsArray.length === 0) {
          console.warn('Questions array is empty or undefined.');
          this.isLoadingQuestions = false;
          return;
        }

        this.questionsArray = questionsArray;
        const questionIndex = this.questionsArray.findIndex(
          (q) => q.questionText === currentQuestion.questionText
        );
        this.prepareAndSetExplanationText(questionIndex);
        this.isLoadingQuestions = false;
      },
      error: (error: Error) => {
        console.error('Error fetching questions array:', error);
        this.isLoadingQuestions = false;
      },
    });
  }

  selectOption(currentQuestion: QuizQuestion, option: Option): void {
    this.selectedOptions = [option];
    this.showFeedbackForOption = { [option.optionId]: true };
    this.showFeedback = true;
    this.selectedOption = option;

    // Update the selected option in the quiz service and mark the question as answered
    this.quizService.updateSelectedOptions(
      this.quizService.quizId,
      this.currentQuestionIndex,
      option.optionId
    ); 

    this.updateSelectionMessage(true);

    const explanationText =
      this.explanationTextService.getFormattedExplanationTextForQuestion(
        this.currentQuestionIndex
      ) || 'No explanation available';
    this.explanationTextService.setExplanationText(explanationText);

    // Set the explanation text in the quiz question manager service (if needed)
    this.quizQuestionManagerService.setExplanationText(
      currentQuestion.explanation || ''
    );

    // Emit events and update states after the option is selected
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.optionClicked.emit();
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit(this.isOptionSelected);

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions
    });
  }

  unselectOption(): void {
    this.selectedOptions = [];
    this.optionChecked = {};
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.selectedOption = null;
    this.quizQuestionManagerService.setExplanationText(null);
  }

  async prepareAndSetExplanationText(questionIndex: number): Promise<void> {
    if (document.hidden) {
      return;
    }

    const questionData = await this.quizService.getNextQuestion(
      this.currentQuestionIndex
    );
    if (this.quizQuestionManagerService.isValidQuestionData(questionData)) {
      await this.processExplanationText(questionData, questionIndex);
    } else {
      console.error('Error: questionData or explanation is undefined');
    }
  }

  private async processExplanationText(
    questionData: QuizQuestion,
    questionIndex: number
  ): Promise<void> {
    this.explanationTextService.setCurrentQuestionExplanation(
      questionData.explanation
    );

    try {
      const formattedExplanation = await this.getFormattedExplanation(
        questionData,
        questionIndex
      );
      this.handleFormattedExplanation(formattedExplanation, questionIndex);
    } catch (error) {
      console.error('Error in processing explanation text:', error);
    }
  }

  private async getFormattedExplanation(
    questionData: QuizQuestion,
    questionIndex: number
  ): Promise<{ questionIndex: number; explanation: string }> {
    const formattedExplanationObservable =
      this.explanationTextService.formatExplanationText(
        questionData,
        questionIndex
      );
    return firstValueFrom(formattedExplanationObservable);
  }

  private handleFormattedExplanation(
    formattedExplanation: FormattedExplanation,
    questionIndex: number
  ): void {
    if (!formattedExplanation) {
      console.error('Error: formatExplanationText returned void');
      return;
    }

    const explanationText =
      typeof formattedExplanation === 'string'
        ? formattedExplanation
        : formattedExplanation.explanation || 'No explanation available';

    this.updateExplanationUI(questionIndex, explanationText);
  }

  private updateExplanationUI(
    questionIndex: number,
    explanationText: string
  ): void {
    this.explanationText$.next(explanationText);
    this.updateCombinedQuestionData(
      this.questions[questionIndex],
      explanationText
    );
    this.emitUIUpdateEvents();
  }

  private emitUIUpdateEvents(): void {
    this.isAnswerSelectedChange.emit(true);
    this.toggleVisibility.emit();
  }

  updateCombinedQuestionData(
    currentQuestion: QuizQuestion,
    explanationText: string
  ): void {
    this.combinedQuestionData$.next({
      questionText: currentQuestion?.questionText || '',
      explanationText: explanationText,
      correctAnswersText: this.quizService.getCorrectAnswersAsString(), 
      currentOptions: this.currentOptions,
    });
  }

  async onSubmit(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    const selectedOption = this.questionForm.get('selectedOption').value;
    await this.processAnswer(selectedOption);

    // Emit an event to notify QuizComponent that processing is complete
    this.questionAnswered.emit(true);
  }

  private validateForm(): boolean {
    if (this.questionForm.invalid) {
      console.log('Form is invalid');
      return false;
    }

    const selectedOption = this.questionForm.get('selectedOption').value;
    if (selectedOption === null) {
      console.log('No option selected');
      return false;
    }

    return true; // Form is valid and option is selected
  }

  private async processAnswer(selectedOption: any): Promise<boolean> {
    if (
      !selectedOption ||
      !this.currentQuestion.options.find(
        (opt) => opt.optionId === selectedOption.id
      )
    ) {
      console.error('Invalid or unselected option.');
      return false;
    }

    this.answers.push({
      question: this.currentQuestion,
      questionIndex: this.currentQuestionIndex,
      selectedOption: selectedOption
    });

    let isCorrect = false;
    try {
      isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    } catch (error) {
      console.error('Error checking answer correctness:', error);
    }

    const explanationText = this.currentQuestion.explanation;

    const quizId = this.quizService.getCurrentQuizId();
    const questionId = this.currentQuestionIndex;

    // Update the state to include the selected option and adjust the number of correct answers
    const selectedOptions = this.currentQuestion.selectedOptions || [];
    selectedOptions.push(selectedOption); // Add the newly selected option
    const numberOfCorrectAnswers = selectedOptions.filter(
      (opt) => opt.correct
    ).length;

    this.quizStateService.setQuestionState(quizId, questionId, {
      isAnswered: true,
      isCorrect: isCorrect,
      explanationText: explanationText,
      selectedOptions: selectedOptions,
      numberOfCorrectAnswers: numberOfCorrectAnswers
    });

    // this.quizService.playSound(isCorrect);

    return isCorrect;
  }

  private handleQuizCompletion(): void {
    this.quizService.submitQuizScore(this.answers).subscribe(() => {
      this.router.navigate(['quiz', 'result']);
    });
  } 

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }

    console.log('Selected option:', selectedOption.text);

    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }

    // Directly play the sound based on the correctness of the selected option
    if (selectedOption.correct) {
      console.log('Selected option is correct, playing correct sound...');
      this.quizService.correctSound?.play();
    } else {
      console.log('Selected option is incorrect, playing incorrect sound...');
      this.quizService.incorrectSound?.play();
    }
  } */

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }

    console.log('Selected option:', selectedOption.text);

    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }

    const optionIndex = this.currentQuestion.options.findIndex(
      (option) => option.text === selectedOption.text
    );

    if (optionIndex === undefined || optionIndex === null) {
      console.log('Option index is undefined or null');
      return;
    }

    console.log('Option index:', optionIndex);

    if (selectedOption.correct) {
      console.log('Selected option is correct, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.correctSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    } else {
      console.log('Selected option is incorrect, playing sound...');
      this.timerService.stopTimer((elapsedTime) => {
        const sound = this.quizService.incorrectSound;
        if (sound) {
          console.dir(sound);
          sound.play();
        }
      });
    }
  } */

  /* playSound(selectedOption: Option): void {
    if (!selectedOption) {
      console.log('Selected option is undefined or null.');
      return;
    }

    console.log('Selected option:', selectedOption.text);

    // Check if 'this.currentQuestion' and 'this.currentQuestion.options' are defined
    if (!this.currentQuestion || !this.currentQuestion.options) {
      console.log('Current question or options are undefined or null.');
      return;
    }

    const optionIndex = this.currentQuestion.options.findIndex(option => option.text === selectedOption.text);

    if (optionIndex === undefined || optionIndex === null) {
      console.log('Option index is undefined or null');
      return;
    }

    console.log('Option index:', optionIndex);

    // Log the correctness and delegate sound playing to QuizService
    if (selectedOption.correct) {
      console.log('Selected option is correct, playing correct sound...');
    } else {
      console.log('Selected option is incorrect, playing incorrect sound...');
    }

    // Stop timer and play sound based on correctness
    this.timerService.stopTimer(() => {
      this.quizService.playSoundForOption(selectedOption.correct);
    });
  } */

  /* playSound(): void {
    const audioUrl = 'http://www.marvinrusinek.com/sound-correct.mp3';  // Ensure this URL is absolutely correct
    const audio = new Audio(audioUrl);
    audio.play().then(() => {
      console.log('Playback succeeded!');
    }).catch(error => {
      console.error('Playback failed:', error);
    });
  } */
}