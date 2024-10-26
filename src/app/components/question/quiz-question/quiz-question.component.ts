import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, take, takeUntil, tap } from 'rxjs/operators';

import { Utils } from '../../../shared/utils/utils';
import { AudioItem } from '../../../shared/models/AudioItem.model';
import { FormattedExplanation } from '../../../shared/models/FormattedExplanation.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionState } from '../../../shared/models/QuestionState.model';
import { Quiz } from '../../../shared/models/Quiz.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { SelectedOption } from '../../../shared/models/SelectedOption.model';
import { SharedOptionConfig } from '../../../shared/models/SharedOptionConfig.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { DynamicComponentService } from '../../../shared/services/dynamic-component.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { ResetBackgroundService } from '../../../shared/services/reset-background.service';
import { ResetStateService } from '../../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../../shared/services/shared-visibility.service';
import { TimerService } from '../../../shared/services/timer.service';
import { UserPreferenceService } from '../../../shared/services/user-preference.service';
import { BaseQuestionComponent } from '../../../components/question/base/base-question.component';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './quiz-question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent extends BaseQuestionComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion,
    selectedOptions: Option[]
  }> = new EventEmitter();
  @Output() questionAnswered = new EventEmitter<QuizQuestion>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() explanationToDisplayChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() showExplanationChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() selectionMessageChange: EventEmitter<string> =
    new EventEmitter<string>();
  @Output() isAnsweredChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
  @Output() isAnswered = false;
  @Output() answerSelected = new EventEmitter<boolean>();
  @Output() optionSelected = new EventEmitter<{option: SelectedOption, index: number, checked: boolean}>();
  @Input() data: {
    questionText: string,
    explanationText?: string,
    correctAnswersText?: string,
    options: Option[]
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[] = [];
  @Input() currentQuestion: QuizQuestion | null = null;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() explanationText: string | null;
  @Input() isOptionSelected = false;
  @Input() showFeedback = false;
  @Input() selectionMessage: string;
  @Input() reset: boolean;

  combinedQuestionData$: Subject<{
    questionText: string,
    explanationText?: string,
    correctAnswersText?: string,
    currentOptions: Option[]
  }> = new Subject();

  questionIndex: number;
  questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
  selectedOption: SelectedOption | null = null;
  selectedOptions: SelectedOption[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  options$: Observable<Option[]>;
  quiz: Quiz;
  questionsArray: QuizQuestion[] = [];
  questionsObservableSubscription: Subscription;
  questionForm: FormGroup = new FormGroup({});
  selectedQuiz = new ReplaySubject<Quiz>(1);
  totalQuestions: number;
  currentOptions: Option[] | undefined;
  correctAnswers: number[] | undefined;
  correctMessage = '';
  alreadyAnswered = false;
  optionChecked: { [optionId: number]: boolean } = {};
  answers: any[] = [];
  correctOptionIndex: number;
  shuffleOptions = true;
  shuffledOptions: Option[];
  feedbackIcon: string;
  feedbackVisible: { [optionId: number]: boolean } = {};
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  displayOptions: Option[] = [];
  correctAnswersLoaded = false;
  resetFeedbackSubscription: Subscription;
  resetStateSubscription: Subscription;
  sharedVisibilitySubscription: Subscription;
  optionSelectionSubscription: Subscription;
  isMultipleAnswer: boolean;
  isExplanationTextDisplayed = false;
  isNavigatingToPrevious = false;
  isLoading = true;
  isLoadingQuestions = false;
  isFirstQuestion = true;
  isPaused = false;
  lastMessage = '';
  private initialized = false;
  shouldDisplayAnswers = false;
  feedbackText = '';
  displayExplanation = false;
  private tabVisible = true;
  sharedOptionConfig: SharedOptionConfig;
  shouldRenderComponent = false;

  explanationTextSubject = new BehaviorSubject<string>('');
  feedbackTextSubject = new BehaviorSubject<string>('');
  selectionMessageSubject = new BehaviorSubject<string>('');

  explanationText$ = this.explanationTextSubject.asObservable();
  feedbackText$ = this.feedbackTextSubject.asObservable();
  selectionMessage$ = this.selectionMessageSubject.asObservable();

  // Define audio list array
  audioList: AudioItem[] = [];

  // Correct and incorrect audio sources
  correctAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-correct.mp3',
    title: 'Correct Answer',
  };
  incorrectAudioSource: AudioItem = {
    url: '../../../../../../../assets/audio/sound-incorrect.mp3',
    title: 'Incorrect Answer',
  };

  private destroy$: Subject<void> = new Subject<void>();

  constructor(
    protected quizService: QuizService,
    protected quizDataService: QuizDataService,
    protected quizStateService: QuizStateService,
    protected quizQuestionManagerService: QuizQuestionManagerService,
    protected dynamicComponentService: DynamicComponentService,
    protected explanationTextService: ExplanationTextService,
    protected resetBackgroundService: ResetBackgroundService,
    protected resetStateService: ResetStateService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected timerService: TimerService,
    protected userPreferenceService: UserPreferenceService,
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router,
    protected ngZone: NgZone,
    protected el: ElementRef
  ) {
    super(
      fb,
      dynamicComponentService,
      quizService,
      quizStateService,
      selectedOptionService,
      cdRef
    );

    console.log('QuizStateService injected:', !!this.quizStateService);

    this.sharedVisibilitySubscription =
      this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
        this.handlePageVisibilityChange(isHidden);
    });

    this.addVisibilityChangeListener();

    this.quizService
      .getIsNavigatingToPrevious()
      .subscribe(
        (isNavigating) => (this.isNavigatingToPrevious = isNavigating)
      );

    this.quizService
      .getTotalQuestionsCount()
      .pipe(takeUntil(this.destroy$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });
  }

  async ngOnInit(): Promise<void> {
    // super.ngOnInit();
    super.ngOnInit ? super.ngOnInit() : null;

    this.initializeData();
    this.initializeForm();
    this.waitForQuestionData();
  
    this.quizStateService.isLoading$.subscribe((isLoading) => {
      console.log('isLoading$', isLoading);
    });
  
    this.quizStateService.isAnswered$.subscribe((isAnswered) => {
      console.log('isAnswered$', isAnswered);
    });
  
    this.quizStateService.setLoading(true);
  
    // Ensure optionsToDisplay is correctly set
    if (this.options && this.options.length > 0) {
      console.log('Setting optionsToDisplay from this.options');
      this.optionsToDisplay = this.options;
    } else if (this.questionData && this.questionData.options && this.questionData.options.length > 0) {
      console.log('Setting optionsToDisplay from this.questionData.options');
      this.optionsToDisplay = this.questionData.options;
    } else {
      console.info('No options available initially. Initializing optionsToDisplay as an empty array.');
      this.optionsToDisplay = [];
    }    
    console.log('Options to Display:::::>>>>>>', this.optionsToDisplay); // Debugging statement
  
    // Set correct options in the quiz service
    this.quizService.setCorrectOptions(this.optionsToDisplay);
  
    if (!this.question) {
      console.warn('Question not available, waiting for data...');
      return;
    } else {
      console.log('Loaded question:', this.question);
    }

    if (this.question && this.question.options) {
      const hasMultipleAnswers =
        this.question.options.filter((option) => option.correct).length > 1;
      this.multipleAnswer.next(hasMultipleAnswers);
    } else {
      console.error(
        'Question or options are undefined in QuizQuestionComponent ngOnInit'
      );
    }
  
    this.resetFeedbackSubscription =
      this.resetStateService.resetFeedback$.subscribe(() => {
        console.log('QuizQuestionComponent - Reset feedback triggered');
        this.resetFeedback();
      });
  
    this.resetStateSubscription = this.resetStateService.resetState$.subscribe(
      () => {
        console.log('QuizQuestionComponent - Reset state triggered');
        this.resetState();
      }
    );

    setTimeout(() => {
      console.log("Emitting test event");
      this.optionSelected.emit({option: {} as SelectedOption, index: 0, checked: true});
    }, 1000);
  
    try {
      const quizId =
        this.activatedRoute.snapshot.paramMap.get('quizId') || this.quizId;
      if (!quizId) {
        console.error('Quiz ID is missing');
        return;
      }
  
      const questions = await this.fetchAndProcessQuizQuestions(quizId);
  
      if (questions && questions.length > 0) {
        this.questions = of(questions);
        this.questions.subscribe({
          next: (questions: QuizQuestion[]) => {
            this.questionsArray = questions;
  
            if (this.questionsArray.length === 0) {
              console.error('Questions are not initialized');
              return;
            }
  
            this.selectedOptionService.selectedOption$.subscribe(
              (selectedOption) => {
                this.selectedOption = selectedOption;
              }
            );
          },
          error: (err) => {
            console.error('Error fetching questions', err);
          },
        });
      } else {
        console.error('No questions were loaded...');
      }
  
      // Ensure this.quiz is set correctly
      this.quiz = this.quizService.getActiveQuiz();
      if (!this.quiz) {
        console.error('Failed to get the active quiz');
        return;
      }
  
      this.resetMessages();
      this.resetStateForNewQuestion();
      this.subscribeToOptionSelection();
  
      if (!this.initialized) {
        this.initialized = true;
        await this.initializeQuiz();
      }
  
      this.initializeQuizQuestion();
      await this.handleQuestionState();
  
      // Subscribe to selectionMessage$ to update the message displayed in the template
      this.selectionMessageService.selectionMessage$
        .pipe(debounceTime(200))
        .subscribe((message) => {
          this.selectionMessage = message as string;
        });
      this.selectionMessageService.resetMessage();
  
      this.initializeComponent();
      this.loadInitialQuestionAndMessage();
  
      document.addEventListener(
        'visibilitychange',
        this.onVisibilityChange.bind(this)
      );
      this.logInitialData();
      this.logFinalData();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    }
  
    // Ensure the explanation text is not displayed initially
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationToDisplayChange.emit(''); // Clear the explanation text
    this.showExplanationChange.emit(false); // Emit the flag to hide the explanation
  }

  async ngAfterViewInit(): Promise<void> {
    // await super.ngAfterViewInit();
    super.ngAfterViewInit ? super.ngAfterViewInit() : null;
    // this.updateSelectionMessage(this.isAnswered);
    this.setInitialMessage();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.questionData) {
      console.log('questionData changed:', this.questionData);
      this.initializeSharedOptionConfig();
    }

    if (changes.currentQuestionIndex || changes.isAnswered) {
      this.updateSelectionMessage(this.isAnswered);
    }

    if (changes.options || changes.questionData) {
      this.optionsToDisplay = this.options;
    }

    const isSubsequentChange = (change: SimpleChange) =>
      change && !change.firstChange;

    // Check for changes in correctAnswers or selectedOptions
    if (
      isSubsequentChange(changes.correctAnswers) ||
      isSubsequentChange(changes.selectedOptions)
    ) {
      if (this.currentQuestion) {
        this.getCorrectAnswers();
        this.correctMessage = this.quizService.setCorrectMessage(
          this.quizService.correctAnswerOptions,
          this.optionsToDisplay
        );
      } else {
        console.warn(
          'QuizQuestionComponent - ngOnChanges - Question is undefined when trying to get correct answers.'
        );
      }
    }

    // Check for changes in the current question
    if (isSubsequentChange(changes.currentQuestion)) {
      if (this.currentQuestion) {
        this.quizService.handleQuestionChange(
          this.currentQuestion,
          isSubsequentChange(changes.selectedOptions)
            ? changes.selectedOptions.currentValue
            : null,
          this.options
        );
      } else {
        console.warn(
          'QuizQuestionComponent - ngOnChanges - Question is undefined after change.'
        );
      }
    } else if (isSubsequentChange(changes.selectedOptions)) {
      this.quizService.handleQuestionChange(
        null,
        changes.selectedOptions.currentValue,
        this.options
      );
    }

    if (changes.reset && changes.reset.currentValue) {
      this.resetFeedback();
    }
  }

  ngOnDestroy(): void {
    super.ngOnDestroy ? super.ngOnDestroy() : null;
    document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange.bind(this)
    );
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.optionSelectionSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
    this.resetFeedbackSubscription?.unsubscribe();
    this.resetStateSubscription?.unsubscribe();
  }

  // Listen for the visibility change event
  @HostListener('window:visibilitychange', [])
  onVisibilityChange(): void {
    if (document.hidden) {
      this.saveQuizState();
    } else {
      this.restoreQuizState();
      this.ngZone.run(async () => {
        if (!this.quizId) {
          this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId') || this.quizId;
          if (!this.quizId) {
            console.error('Unable to retrieve Quiz ID, cannot fetch questions');
            return;
          }
        }

        try {
          await this.fetchAndProcessQuizQuestions(this.quizId);

          const isAnswered = await this.isQuestionAnswered(this.currentQuestionIndex);
          await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
        } catch (error) {
          console.error('Error in onVisibilityChange:', error);
        }
      });
    }
  }

  onQuestionChange(question: QuizQuestion): void {
    this.questionAnswered.emit(question);
  }

  addVisibilityChangeListener() {
    document.addEventListener('visibilitychange', () => {
      this.tabVisible = !document.hidden;
      if (this.tabVisible) {
        console.log('Tab is visible again. Re-checking state...');
        this.recheckSelectionState();
      }
    });
  }

  recheckSelectionState(): void {
    // Recheck the state of the selected options to ensure everything is correct
    if (this.isAnswerSelected()) {
      console.log(
        'Answer was already selected. Ensuring the Next button is enabled.'
      );
      this.selectedOptionService.isAnsweredSubject.next(true);
    } else {
      console.log('No answer selected. Waiting for user interaction.');
      this.selectedOptionService.isAnsweredSubject.next(false);
    }
  }

  isAnswerSelected(): boolean {
    return this.selectedOptions && this.selectedOptions.length > 0;
  }

  private saveQuizState(): void {
    sessionStorage.setItem(
      'currentQuestionIndex',
      this.currentQuestionIndex.toString()
    );
    sessionStorage.setItem(
      'currentQuestion',
      JSON.stringify(this.currentQuestion)
    );
    sessionStorage.setItem(
      'optionsToDisplay',
      JSON.stringify(this.optionsToDisplay)
    );
  }

  private restoreQuizState(): void {
    // Restore the state from session storage
    const storedIndex = sessionStorage.getItem('currentQuestionIndex');
    const storedQuestion = sessionStorage.getItem('currentQuestion');
    const storedOptions = sessionStorage.getItem('optionsToDisplay');

    if (
      storedIndex !== null &&
      storedQuestion !== null &&
      storedOptions !== null
    ) {
      this.currentQuestionIndex = +storedIndex;
      this.currentQuestion = JSON.parse(storedQuestion);
      this.optionsToDisplay = JSON.parse(storedOptions);
    } else {
      this.loadQuestion();
    }
  }

  private initializeComponent(): void {
    // Load the first question or current question
    this.loadQuestion();

    // Set the initial message for the first question
    if (this.currentQuestionIndex === 0) {
      this.setInitialMessage();
    }
  }

  async loadDynamicComponent(): Promise<void> {
    try {
      if (!this.dynamicAnswerContainer) {
        console.error('dynamicAnswerContainer is still undefined in QuizQuestionComponent');
        return;
      }
  
      this.dynamicAnswerContainer.clear(); // Clear previous components
  
      const isMultipleAnswer = await firstValueFrom(
        this.quizStateService.isMultipleAnswerQuestion(this.question)
      );
  
      const componentRef: ComponentRef<BaseQuestionComponent> = 
        await this.dynamicComponentService.loadComponent(
          this.dynamicAnswerContainer,
          isMultipleAnswer
        );
  
      const instance = componentRef.instance as BaseQuestionComponent;
  
      if (!instance) {
        console.error('Component instance is undefined');
        return;
      }
  
      // Assign properties to the component instance
      instance.questionForm = this.questionForm;
      instance.question = this.question;
      instance.optionsToDisplay = [...this.optionsToDisplay];
  
      // Use hasOwnProperty to assign onOptionClicked only if not already assigned
      if (!Object.prototype.hasOwnProperty.call(instance, 'onOptionClicked')) {
        instance.onOptionClicked = this.onOptionClicked.bind(this);
        console.log('onOptionClicked bound for the first time.');
      } else {
        console.warn('onOptionClicked already assigned, skipping reassignment.');
      }
  
      // Trigger change detection to ensure updates
      componentRef.changeDetectorRef.markForCheck();
      console.log('Change detection triggered for dynamic component.');
    } catch (error) {
      console.error('Error loading dynamic component:', error);
    }
  }

  private loadInitialQuestionAndMessage(): void {
    // Load the initial question
    this.loadQuestion();

    // Set the initial message after the question is loaded
    this.setInitialMessage();
  }

  private setInitialMessage(): void {
    const initialMessage = 'Please start the quiz by selecting an option.';
    const currentMessage =
      this.selectionMessageService.selectionMessageSubject.getValue();

    // Only set the message if it's not already set or if it's empty
    if (!currentMessage || currentMessage === '') {
      console.log('Setting initial message:', initialMessage);
      this.selectionMessageService.updateSelectionMessage(initialMessage);
    } else {
      console.log('Initial message already set, skipping update.');
    }
  }

  private updateSelectionMessage(isAnswered: boolean): void {
    const currentMessage =
      this.selectionMessageService.selectionMessageSubject.getValue();
    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered
    );

    // Update the message only if it has changed
    if (currentMessage !== newMessage) {
      console.log('Updating selection message to:', newMessage);
      this.selectionMessageService.updateSelectionMessage(newMessage);
    } else {
      console.log('Selection message remains the same, no update needed.');
    }
  }

  public async loadQuestion(signal?: AbortSignal): Promise<void> {
    this.resetQuestionAndExplanationState();
    this.resetExplanation();
    this.resetTexts();
    
    this.isLoading = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setAnswered(false);
  
    // Clear previous data
    this.currentQuestion = null;
    this.optionsToDisplay = [];
    this.feedbackText = '';
  
    try {
      // Ensure a valid quiz ID is available
      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) throw new Error('No active quiz ID found');
  
      // Fetch the current question by index
      this.currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(quizId, this.currentQuestionIndex)
      );
  
      if (!this.currentQuestion) {
        throw new Error(`No question found for index ${this.currentQuestionIndex}`);
      }
  
      // Set the options to display for the current question
      this.optionsToDisplay = this.currentQuestion.options || [];
  
      // Abort handling
      if (signal?.aborted) {
        console.log('Load question operation aborted.');
        return;
      }
  
      // Display explanation only if the question is answered
      await this.handleExplanationDisplay();
  
      // Update the selection message
      this.updateSelectionMessage(false);
  
    } catch (error) {
      console.error('Error loading question:', error);
      this.feedbackText = 'Error loading question. Please try again.';
    } finally {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
    }
  }

  private async handleExplanationDisplay(): Promise<void> {
    if (this.isAnswered) {
      await this.fetchAndSetExplanationText(this.currentQuestionIndex);
      this.updateExplanationDisplay(true);
    } else {
      this.updateExplanationDisplay(false);
    }
  }
  
  async getFeedbackText(currentQuestion: QuizQuestion): Promise<string> {
    const correctOptions = currentQuestion.options.filter(
      (option) => option.correct
    );
    return this.quizService.setCorrectMessage(
      correctOptions,
      this.optionsToDisplay
    );
  }

  async prepareAndSetFeedbackText(question: QuizQuestion): Promise<string> {
    if (!question) {
      throw new Error('No question provided for feedback text.');
    }

    const correctOptions = question.options.filter((option) => option.correct);
    return this.quizService.setCorrectMessage(
      correctOptions,
      this.optionsToDisplay
    );
  }

  async prepareFeedbackText(question: QuizQuestion): Promise<string> {
    try {
      const correctOptions = question.options.filter(
        (option) => option.correct
      );
      return this.quizService.setCorrectMessage(
        correctOptions,
        this.optionsToDisplay
      );
    } catch (error) {
      console.error('Error in preparing feedback text:', error);
      return 'Error generating feedback.';
    }
  }

  private async fetchExplanationAndFeedbackText(): Promise<void> {
    try {
      // Simulate async operation if needed
      await new Promise((resolve) => setTimeout(resolve, 50));
      const explanationTextPromise = this.prepareAndSetExplanationText(
        this.currentQuestionIndex
      );
      const feedbackTextPromise = this.generateFeedbackText(
        this.currentQuestion
      );

      // Fetch both texts in parallel
      const [explanationText, feedbackText] = await Promise.all([
        explanationTextPromise,
        feedbackTextPromise,
      ]);

      // Set both texts
      this.explanationToDisplay = explanationText;
      this.feedbackText = feedbackText;

      console.log('Explanation and feedback texts set simultaneously:', {
        explanationText,
        feedbackText,
      });
    } catch (error) {
      console.error('Error fetching explanation and feedback text:', error);
    }
  }

  private async generateFeedbackText(question: QuizQuestion): Promise<string> {
    const correctOptions = question.options.filter((option) => option.correct);
    return this.quizService.setCorrectMessage(
      correctOptions,
      this.optionsToDisplay
    );
  }

  private resetTexts(): void {
    this.explanationTextSubject.next('');
    this.feedbackTextSubject.next('');
    this.selectionMessageSubject.next('');
  }

  isSelectedOption(option: Option): boolean {
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);
    return isOptionSelected;
  }

  trackByOption(option: Option): number {
    return option.optionId;
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

  public shouldShowFeedback(option: Option): boolean {
    return (
      this.showFeedback && this.selectedOption?.optionId === option.optionId
    );
  }

  handleQuestionUpdate(newQuestion: QuizQuestion): void {
    if (!newQuestion.selectedOptions) {
      newQuestion.selectedOptions = [];
    }

    this.getCorrectAnswers();
  } 

  private initializeData(): void {
    if (!this.question) {
      console.warn('Question is not defined.');
      return;
    }

    this.data = {
      questionText: this.question.questionText,
      explanationText: this.question.explanation,
      correctAnswersText: this.quizService.getCorrectAnswersAsString(), // logging empty string
      options: this.options || []
    };
  }

  private async initializeQuiz(): Promise<void> {
    if (this.initialized) return; // Prevent re-initialization
    this.initialized = true;

    console.log('Quiz initialization started.');

    // Initialize selected quiz and questions
    this.initializeSelectedQuiz();
    await this.initializeQuizQuestionsAndAnswers();

    console.log('Quiz questions and answers initialized.');

    // Ensure the question is fully loaded before setting the message
    this.loadQuestionAndSetInitialMessage();
  }

  private loadQuestionAndSetInitialMessage(): void {
    this.loadQuestion(); // Load the question first

    // Set the initial message after the question is fully loaded
    setTimeout(() => {
      console.log('Setting initial message.');
      this.setInitialMessage();
    }, 100); // Adjust the delay as needed
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
      ? this.optionsToDisplay
      : this.data?.options;
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
            for (const quizQuestion of questions) {
              quizQuestion.selectedOptions = null;

              // Check if options exist and are an array before mapping
              if (Array.isArray(quizQuestion.options)) {
                quizQuestion.options = quizQuestion.options.map(
                  (option, index) => ({
                    ...option,
                    optionId: index,
                  })
                );
              } else {
                console.error(
                  `Options are not properly defined for question: ${quizQuestion.questionText}`
                );
                quizQuestion.options = []; // Initialize as an empty array to prevent further errors
              }
            }
            return questions;
          })
        )
        .subscribe({
          next: (questions: QuizQuestion[]) => {
            // Initialize the first question
            if (questions && questions.length > 0) {
              this.selectedOptionService.resetAnsweredState();
              const hasAnswered =
                this.selectedOptionService.getSelectedOption() !== null;
              this.selectedOptionService.setAnsweredState(hasAnswered);
              console.log(
                'Initial answered state for the first question:',
                hasAnswered
              );
              this.cdRef.markForCheck(); // Trigger change detection
            }
          },
          error: (err) => {
            console.error('Error fetching questions:', err);
          },
        });
    }
  }

  private async initializeQuizQuestionsAndAnswers(): Promise<void> {
    try {
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
      await this.fetchAndProcessQuizQuestions(this.quizId);

      if (this.quizId) {
        await this.quizDataService.asyncOperationToSetQuestion(
          this.quizId,
          this.currentQuestionIndex
        );
      } else {
        console.error('Quiz ID is empty after initialization.');
      }
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  private async fetchAndProcessQuizQuestions(
    quizId: string
  ): Promise<QuizQuestion[]> {
    if (!quizId) {
      console.error('Quiz ID is not provided or is empty.');
      return [];
    }

    this.isLoading = true;

    try {
      const questions = await this.quizService.fetchQuizQuestions(quizId);

      if (questions && questions.length > 0) {
        this.questions = of(questions);

        // Ensure option IDs are set
        for (const [qIndex, question] of questions.entries()) {
          if (question.options) {
            for (const [oIndex, option] of question.options.entries()) {
              option.optionId = oIndex;
            }
          } else {
            console.error(
              `Options are not properly defined for question: ${question.questionText}`
            );
          }
        }

        // Handle explanation texts for previously answered questions
        for (const [index, question] of questions.entries()) {
          const state = this.quizStateService.getQuestionState(quizId, index);
          if (state?.isAnswered) {
            try {
              const explanationText = await this.getExplanationText(index);
              const formattedExplanationText: FormattedExplanation = {
                questionIndex: index,
                explanation: explanationText
              };
              this.explanationTextService.formattedExplanations[index] = formattedExplanationText;
            } catch (error) {
              // Set a default explanation and handle the error as needed
              console.error(`Error getting explanation for question ${index}:`, error);
              this.explanationTextService.formattedExplanations[index] = {
                questionIndex: index,
                explanation: 'Unable to load explanation.'
              };
            }
          }
        }
        return questions;
      } else {
        console.error('No questions were loaded');
        return [];
      }
    } catch (error) {
      console.error('Error loading questions:', error);
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  private async handleQuestionState(): Promise<void> {
    if (this.currentQuestionIndex === 0) {
      await this.setInitialSelectionMessageForFirstQuestion();
    } else {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );

      // Clear the selection state when handling a new question
      this.clearSelection();

      // Check if the message should be updated
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('[handleQuestionState] No message update required');
      }
    }
  }

  // Subscribe to option selection changes
  private subscribeToOptionSelection(): void {
    if (this.optionSelectionSubscription) {
      this.optionSelectionSubscription.unsubscribe();
    }
  
    this.optionSelectionSubscription = this.selectedOptionService
      .isOptionSelected$()
      .pipe(
        debounceTime(500), // Debounce to prevent rapid changes
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(async (isSelected: boolean) => {
        console.log('Option selection changed:', { isSelected });
  
        try {
          this.isOptionSelected = isSelected;
  
          const isAnswered =
            isSelected ||
            (await this.isQuestionAnswered(this.currentQuestionIndex));
          this.selectedOptionService.setAnsweredState(isAnswered);
  
          if (this.shouldUpdateMessageOnSelection(isSelected)) {
            await this.updateSelectionBasedOnState(isSelected);
  
            // Check for asynchronous state changes
            await this.checkAsynchronousStateChanges();
          }
        } catch (error) {
          console.error(
            '[subscribeToOptionSelection] Error processing option selection:',
            error
          );
        }
      });
  }

  private shouldUpdateMessageOnSelection(isSelected: boolean): boolean {
    // Check if the current question is not the first one or if an option is selected
    return this.currentQuestionIndex !== 0 || isSelected;
  }

  private shouldUpdateMessageOnAnswer(isAnswered: boolean): boolean {
    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered
    );

    console.log('Determined new message:', newMessage);
    console.log('Current selection message:', this.selectionMessage);

    return this.selectionMessage !== newMessage;
  }

  private async updateSelectionBasedOnState(
    isSelected: boolean
  ): Promise<void> {
    try {
      if (this.currentQuestionIndex === 0 && !isSelected) {
        await this.setInitialSelectionMessageForFirstQuestion();
      } else {
        const isAnswered =
          isSelected ||
          (await this.isQuestionAnswered(this.currentQuestionIndex));
        if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
          await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
        }
      }
    } catch (error) {
      console.error(
        '[updateSelectionBasedOnState] Error updating selection based on state:',
        error
      );
    }
  }

  private async isQuestionAnswered(questionIndex: number): Promise<boolean> {
    this.resetStateForNewQuestion();
    try {
      return await firstValueFrom(this.quizService.isAnswered(questionIndex));
    } catch (error) {
      console.error('Failed to determine if question is answered:', error);
      return false;
    }
  }

  private async setInitialSelectionMessageForFirstQuestion(): Promise<void> {
    try {
      const initialMessage = 'Please start the quiz by selecting an option.';
      if (this.selectionMessage !== initialMessage) {
        this.selectionMessage = initialMessage;
        this.selectionMessageService.updateSelectionMessage(initialMessage);
      } else {
        const isAnswered = await this.isQuestionAnswered(
          this.currentQuestionIndex
        );
        this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      }
    } catch (error) {
      console.error(
        'Error setting initial selection message for the first question:',
        error
      );
    }
  }

  private async checkAsynchronousStateChanges(): Promise<void> {
    try {
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );
      const currentSelectionState =
        this.selectedOptionService.getCurrentOptionSelectedState();

      if (isAnswered !== currentSelectionState) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('[checkAsynchronousStateChanges] No state change detected');
      }
    } catch (error) {
      console.error(
        '[checkAsynchronousStateChanges] Error checking asynchronous state changes:',
        error
      );
    }
  }

  updateCorrectMessageText(message: string): void {
    this.quizService.updateCorrectMessageText(message);
  }

  private logFinalData(): void {
    if (!this.data) {
      console.warn('this.data is undefined or null');
      return;
    }
  
    // Safely assign properties directly to this.data
    this.data = {
      questionText: this.data?.questionText || '',
      options: this.data?.options || [],
      correctAnswersText: this.data?.correctAnswersText || ''
    };
  
    // Log the relevant data
    console.log('questionData:::', this.questionData || 'Not available');
    console.log('MY CORR MSG', this.correctMessage || 'Not available');
  }  

  public async getCorrectAnswers(): Promise<number[]> {
    try {
      // Attempt to recover the current question if it is missing
      if (!this.currentQuestion) {
        this.currentQuestion = await firstValueFrom(this.quizService.getQuestionByIndex(this.currentQuestionIndex));
      }
  
      // Ensure the question text is valid
      if (!this.currentQuestion || !this.currentQuestion.questionText) {
        console.error('Current question is not set or has no valid question text.');
        return [];
      }
  
      console.log('Fetching correct answers for question:', this.currentQuestion.questionText);
  
      // Fetch correct answers from QuizService
      const correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
  
      // Validate the fetched answers
      if (!Array.isArray(correctAnswers) || correctAnswers.length === 0) {
        console.warn(`No correct answers found for question: "${this.currentQuestion.questionText}"`);
        return [];
      }
  
      console.log('Correct answers fetched:', correctAnswers);
      return correctAnswers;
    } catch (error) {
      console.error('Error fetching correct answers:', error);
      return [];
    }
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
              selected: false,
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

  private clearSelection(): void {
    if (this.correctAnswers && this.correctAnswers.length === 1) {
      if (this.currentQuestion && this.currentQuestion.options) {
        for (const option of this.currentQuestion.options) {
          option.selected = false;
          option.styleClass = '';
        }
      }
    }
  }

  public resetState(): void {
    this.resetFeedback();
    this.selectedOptionService.clearOptions();
  }

  public resetFeedback(): void {
    this.correctMessage = '';
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};
  }

  /* public override async onOptionClicked(
    event: { option: SelectedOption | null; index: number; checked: boolean }
  ): Promise<void> {
    console.log('Option clicked:', event); 
  
    // Prevent further action if option is missing or input handling is locked
    if (!event?.option || event.option.optionId === undefined) return;
    if (this.isOptionSelected) {
      console.warn('Click locked, skipping.');
      return;
    }
  
    this.isOptionSelected = true; // Lock input handling temporarily
  
    try {
      await this.ngZone.run(async () => {
        console.log('Inside ngZone after click:', event);
  
        // Delay to ensure UI stability
        await new Promise((resolve) => requestAnimationFrame(resolve));
  
        const { option, index = -1, checked = false } = event || {};
  
        console.log(`Processing option: ${option.optionId} at index: ${index}`);

        // Handle index validation and option selection
        if (typeof index !== 'number' || index < 0) {
          console.error(`Invalid index: ${index}`);
          return;
        }
  
        this.selectedOptionService.setOptionSelected(true);
        this.selectedOptionService.isAnsweredSubject.next(true);
        this.selectedOptionService.setAnswered(true);

        // Ensure the form is ready before updating it
        await this.waitForFormInitialization(option.optionId, checked);

        // Update the form control once it's ready
        this.updateFormControl(option.optionId, checked);

        // Ensure the form control is updated correctly
        this.updateFormControlWithDelay(option.optionId, checked);
  
        // Call the parent class's onOptionClicked if needed
        await super.onOptionClicked(event);
  
        // Additional logic for handling the click
        this.resetExplanation();
        this.toggleOptionState(option, index);
        this.emitOptionSelected(option, index);

        this.startLoading();
        this.handleMultipleAnswerQuestion(option);
        this.markQuestionAsAnswered();
  
        await this.processSelectedOption(option, index, checked);
        await this.finalizeSelection(option, index);
  
        console.log('Option processed. Applying changes.');
        this.cdRef.detectChanges(); // Ensure the UI reflects changes
      });
    } catch (error) {
      console.error('Error during option click:', error);
    } finally {
      // Reset the lock after click processing completes
      setTimeout(() => (this.isOptionSelected = false), 300); // Cooldown period
      this.finalizeLoadingState();
      this.cdRef.detectChanges();
    }
  } */
  public override async onOptionClicked(
    event: { option: SelectedOption | null; index: number; checked: boolean }
  ): Promise<void> {
    console.log('Option clicked:', event); 
  
    // Prevent further action if option is missing or input handling is locked
    if (!event?.option || event.option.optionId === undefined) return;
    if (this.isOptionSelected) {
      console.warn('Click locked, skipping.');
      return;
    }
  
    this.isOptionSelected = true; // Lock input handling temporarily
  
    try {
      await this.ngZone.run(async () => {
        console.log('Inside ngZone after click:', event);
  
        // Delay to ensure UI stability
        await new Promise((resolve) => requestAnimationFrame(resolve));
  
        const { option, index = -1, checked = false } = event || {};
  
        console.log(`Processing option: ${option.optionId} at index: ${index}`);
  
        // Handle index validation and option selection
        if (typeof index !== 'number' || index < 0) {
          console.error(`Invalid index: ${index}`);
          return;
        }
  
        this.selectedOptionService.setOptionSelected(true);
        this.selectedOptionService.isAnsweredSubject.next(true);
        this.selectedOptionService.setAnswered(true);
  
        // Call the parent class's onOptionClicked if needed
        await super.onOptionClicked(event);
  
        // Additional logic for handling the click
        this.resetExplanation();
        this.toggleOptionState(option, index);
        this.emitOptionSelected(option, index);

        this.startLoading();
        this.handleMultipleAnswerQuestion(option);
        this.markQuestionAsAnswered();

        // Fetch the explanation text AFTER answering and ensuring the option click is processed
        await this.fetchAndSetExplanationText(this.currentQuestionIndex);
  
        await this.processSelectedOption(option, index, checked);
        await this.finalizeSelection(option, index);
  
        console.log('Option processed. Applying changes.');
        this.cdRef.detectChanges(); // Ensure the UI reflects changes
      });
    } catch (error) {
      console.error('Error during option click:', error);
    } finally {
      // Reset the lock after click processing completes
      setTimeout(() => (this.isOptionSelected = false), 300); // Cooldown period
      // Ensure UI stabilization and final updates
      requestAnimationFrame(() => {
        this.updateExplanationText(this.currentQuestionIndex);
        this.cdRef.detectChanges();
      });
      this.finalizeLoadingState();
      this.cdRef.detectChanges();
    }
  }
  
  
  private toggleOptionState(option: SelectedOption, index: number): void {
    if (!option || !('optionId' in option) || typeof option.optionId !== 'number') {
      console.error('Invalid option passed to toggleOptionState:', option);
      return;
    }
  
    option.selected = !option.selected; // Toggle the selection state
  
    // Update the feedback display state for this option
    this.showFeedbackForOption[option.optionId] = option.selected;
    console.log('Updated feedback display state:', this.showFeedbackForOption);
  
    this.selectedOptionService.isAnsweredSubject.next(true);
    console.log(`Option state toggled:`, { option, index });
  }
  
  
  private emitOptionSelected(option: SelectedOption, index: number): void {
    this.optionSelected.emit({ option, index, checked: option.selected });
  }
  
  private startLoading(): void {
    this.quizStateService.setLoading(true);
    this.quizStateService.setAnswerSelected(false);
  
    if (!this.quizStateService.isLoading()) {
      this.quizStateService.startLoading();
    }
  }
  
  private handleMultipleAnswerQuestion(option: SelectedOption): void {
    this.quizStateService.isMultipleAnswerQuestion(this.currentQuestion).subscribe({
      next: (isMultipleAnswer) => {
        console.log('Multiple answer question detected:', isMultipleAnswer);
  
        // Set the selected option in the service
        this.selectedOptionService.setSelectedOption(option);
  
        // Ensure fallback values for option properties if necessary
        const optionId = option.optionId ?? -1;
        const optionText = option.text || 'none';
  
        console.log('Selecting option:', {
          optionId,
          questionIndex: this.currentQuestionIndex,
          text: optionText,
          isMultiSelect: isMultipleAnswer,
        });
  
        // Safely select the option with validated data
        this.selectedOptionService.selectOption(
          optionId,
          this.currentQuestionIndex,
          optionText,
          isMultipleAnswer
        );
  
        // Toggle the selected option state
        this.selectedOptionService.toggleSelectedOption(
          this.currentQuestionIndex,
          option,
          isMultipleAnswer
        );
      },
      error: (error) => {
        console.error('Error determining multiple-answer:', error);
      },
    });
  }
    
  private markQuestionAsAnswered(): void {
    const questionState = this.initializeQuestionState();
    questionState.isAnswered = true;
  
    if (!this.quizStateService.isAnswered$) {
      this.quizStateService.setAnswerSelected(true);
    }
  }
  
  private async processSelectedOption(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    await this.handleOptionProcessingAndFeedback(option, index, checked);
    await this.updateQuestionState(option);
  
    this.handleCorrectAnswers(option);
    this.updateFeedback(option);
  }
  
  private async finalizeSelection(
    option: SelectedOption,
    index: number
  ): Promise<void> {
    const questionState = this.initializeQuestionState();
    await this.finalizeOptionSelection(option, index, questionState);
  }

  private initializeQuestionState(): QuestionState {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndex);
    questionState.isAnswered = false;
    return questionState;
  }

  private async handleOptionProcessingAndFeedback(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    console.log(`Handling option processing and feedback for question ${this.currentQuestionIndex}, option ${index}`);
  
    try {
      const event = { option, index, checked };
      await super.onOptionClicked(event);
  
      this.selectedOptions = [{ ...option, questionIndex: this.currentQuestionIndex }];
      this.selectedOption = { ...option, optionId: index + 1 };
      this.showFeedback = true;
      this.showFeedbackForOption[option.optionId] = true;
  
      // The question is now answered
      this.isAnswered = true;
  
      // Fetch and set the explanation text
      await this.fetchAndSetExplanationText(this.currentQuestionIndex);
      
      // Update the explanation display
      this.updateExplanationDisplay(true);
  
      // Fetch the current question data again to ensure we have the most up-to-date information
      const questionData = await firstValueFrom(this.quizService.getQuestionByIndex(this.currentQuestionIndex));
  
      if (this.quizQuestionManagerService.isValidQuestionData(questionData)) {
        // Process the explanation text
        const processedExplanation = await this.processExplanationText(questionData, this.currentQuestionIndex);
        
        let explanationText = processedExplanation?.explanation ?? questionData.explanation ?? 'No explanation available';
  
        console.log(`Explanation text for question ${this.currentQuestionIndex}:`, explanationText);
  
        // Update the explanation display properties
        this.explanationToDisplay = explanationText;
        this.explanationTextService.updateFormattedExplanation(explanationText);
        this.explanationTextService.setShouldDisplayExplanation(true);
        this.explanationToDisplayChange.emit(explanationText);
        this.showExplanationChange.emit(true);
        this.displayExplanation = true;

        // Set the correct message using the QuizService method
        const correctOptions = questionData.options.filter(opt => opt.correct);
        this.correctMessage = this.quizService.setCorrectMessage(correctOptions, this.optionsToDisplay);
        console.log('QuizQuestionComponent - Correct Message set:', this.correctMessage);

        // Ensure the correctMessage is being updated in the view
        this.cdRef.detectChanges();
      } else {
        console.error('Invalid question data when handling option processing');
        this.explanationToDisplay = 'Error: Invalid question data';
        this.explanationToDisplayChange.emit(this.explanationToDisplay);
      }
    } catch (error) {
      console.error('Error in handleOptionProcessingAndFeedback:', error);
      this.explanationToDisplay = 'Error processing question. Please try again.';
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
    } finally {
      // Ensure the explanation is always displayed, even if there was an error
      this.showExplanationChange.emit(true);
      this.displayExplanation = true;
    }
  }

  private async updateQuestionState(option: SelectedOption): Promise<void> {
    try {
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        { 
          explanationDisplayed: true, 
          selectedOptions: [option],
          explanationText: this.explanationToDisplay
        },
        this.correctAnswers?.length ?? 0
      );
      console.log('Question state updated with explanationDisplayed: true');
    } catch (stateUpdateError) {
      console.error('Error updating question state:',stateUpdateError);
    }
  }

  private async handleCorrectAnswers(option: SelectedOption): Promise<void> {
    try {
      console.log('Handling correct answers for option:', option);
  
      // Fetch correct answers asynchronously
      this.correctAnswers = await this.getCorrectAnswers(); 
      console.log('Fetched correct answers:', this.correctAnswers);
  
      // Check if the correct answers are available
      if (!this.correctAnswers || this.correctAnswers.length === 0) {
        console.warn('No correct answers available for this question.');
        return;
      }
  
      // Check if the selected option is among the correct answers
      const isSpecificAnswerCorrect = this.correctAnswers.includes(option.optionId);
      console.log('Is the specific answer correct?', isSpecificAnswerCorrect);
    } catch (error) {
      console.error('An error occurred while handling correct answers:', error);
    }
  }  

  private updateFeedback(option: SelectedOption): void {
    this.updateFeedbackForOption(option);
  
    console.log(
      'onOptionClicked - showFeedbackForOption:',
      this.showFeedbackForOption
    );
  
    if (!option.correct) {
      console.log('Incorrect option selected.');
      for (const opt of this.optionsToDisplay) {
        if (opt.correct) {
          this.showFeedbackForOption[opt.optionId] = true;
        }
      }
      console.log(
        'Updated showFeedbackForOption after highlighting correct answers:',
        this.showFeedbackForOption
      );
    }
  
    // Find the index of the selected option
    const selectedIndex = this.optionsToDisplay.findIndex(opt => opt.optionId === option.optionId);
    if (selectedIndex !== -1) {
      this.processOptionSelectionAndUpdateState(selectedIndex);
    }
  
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setSelectedOption(option);
    this.selectedOptionService.setAnsweredState(true);
  }

  private async finalizeOptionSelection(option: SelectedOption, index: number, questionState: QuestionState): Promise<void> {
    const currentQuestion = await this.fetchAndProcessCurrentQuestion();
    if (!currentQuestion) {
      console.error('Could not retrieve the current question.');
      return;
    }
    this.selectOption(currentQuestion, option, index);

    this.updateSelectionMessage(questionState.isAnswered);
    await this.updateSelectionMessageBasedOnCurrentState(questionState.isAnswered);

    const newMessage = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      questionState.isAnswered
    );

    this.selectionMessageService.updateSelectionMessage(newMessage);

    this.processCurrentQuestionState(currentQuestion, option, index);

    await this.handleCorrectnessAndTimer();
  }

  private handleError(error: Error): void {
    console.error(
      'An error occurred while processing the option click:', error
    );
  }

  private finalizeLoadingState(): void {
    this.quizStateService.setLoading(false); // Loading state reset in finally block of onOptionClicked()
  }
  
  // Helper method to update feedback for options
  private updateFeedbackForOption(option: SelectedOption): void {
    this.showFeedbackForOption = {}; // Reset the feedback object
    this.showFeedbackForOption[option.optionId] =
      this.showFeedback && this.selectedOption === option;
  }

  private resetMessages(): void {
    this.selectionMessageService.resetMessage();
    const initialMessage = 'Please start the quiz by selecting an option.';
    if (this.selectionMessage !== initialMessage) {
      this.selectionMessage = initialMessage;
      this.selectionMessageService.updateSelectionMessage(initialMessage);
    }
    this.lastMessage = initialMessage;
    this.selectedOptionService.setOptionSelected(false);
  }

  private resetStateForNewQuestion(): void {
    this.optionsToDisplay = [];
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.correctMessage = '';
    this.selectedOption = null;
    this.isOptionSelected = false;
    this.selectedOptionService.clearOptions();
    this.selectedOptionService.setOptionSelected(false);
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.resetAnsweredState();
    this.selectionMessage = 'Please select an option to continue...';
    this.selectionMessageService.updateSelectionMessage(this.selectionMessage);
    this.selectionMessageService.resetMessage();
  }

  private processOptionSelectionAndUpdateState(index: number): void {
    const option = this.question.options[index];
    const selectedOption: SelectedOption = {
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
      text: option.text
    };
    this.selectedOptionService.toggleSelectedOption(
      this.currentQuestionIndex,
      selectedOption,
      this.isMultipleAnswer
    );
    this.selectedOptionService.setOptionSelected(true);
    this.selectedOptionService.setAnsweredState(true);
    this.answerSelected.emit(true);
    this.isFirstQuestion = false; // Reset after the first option click
  }

  private async updateSelectionMessageBasedOnCurrentState(
    isAnswered: boolean
  ): Promise<void> {
    try {
      const newMessage = this.selectionMessageService.determineSelectionMessage(
        this.currentQuestionIndex,
        this.totalQuestions,
        isAnswered
      );

      console.log('Updating selection message. New message:', newMessage);

      if (this.selectionMessage !== newMessage) {
        this.selectionMessage = newMessage;
        this.selectionMessageService.updateSelectionMessage(newMessage);
        console.log('Selection message updated to:', newMessage);
      } else {
        console.log(
          '[updateSelectionMessageBasedOnCurrentState] No message update required'
        );
      }
    } catch (error) {
      console.error(
        '[updateSelectionMessageBasedOnCurrentState] Error updating selection message:',
        error
      );
    }
  }

  public async fetchAndProcessCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      this.resetStateForNewQuestion(); // Reset state before fetching new question

      const quizId = this.quizService.getCurrentQuizId();
      const currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(
          quizId,
          this.currentQuestionIndex
        )
      );
      console.log('Fetched current question::::::>>>>>>', currentQuestion);

      if (!currentQuestion) return null;

      this.currentQuestion = currentQuestion;
      this.optionsToDisplay = [...(currentQuestion.options || [])];

      // Set this.data
      this.data = {
        questionText: currentQuestion.questionText,
        explanationText: currentQuestion.explanation,
        correctAnswersText: this.quizService.getCorrectAnswersAsString(),
        options: this.optionsToDisplay
      };

      // Determine if the current question is answered
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );

      // Update the selection message based on the current state
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      } else {
        console.log('No update required for the selection message.');
      }
      this.updateAnswerStateAndMessage(isAnswered);

      // Return the fetched current question
      return currentQuestion;
    } catch (error) {
      console.error(
        '[fetchAndProcessCurrentQuestion] An error occurred while fetching the current question:',
        error
      );
      return null;
    }
  }

  private processCurrentQuestionState(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    index: number
  ): void {
    console.log('processCurrentQuestionState started', { currentQuestion, option, index });
    this.processCurrentQuestion(currentQuestion);
    this.handleOptionSelection(option, index, currentQuestion);
    this.quizStateService.updateQuestionStateForExplanation(
      this.quizId,
      this.currentQuestionIndex
    );
    this.questionAnswered.emit();
  }

  private updateAnswerStateAndMessage(isAnswered: boolean): void {
    const message = this.selectionMessageService.determineSelectionMessage(
      this.currentQuestionIndex,
      this.totalQuestions,
      isAnswered
    );
    this.setSelectionMessageIfChanged(message);
  }

  // Sets the selection message if it has changed
  private setSelectionMessageIfChanged(newMessage: string): void {
    if (this.selectionMessage !== newMessage) {
      this.selectionMessage = newMessage;
      this.selectionMessageService.updateSelectionMessage(newMessage);
    } else {
      console.log('[setSelectionMessageIfChanged] No message update required');
    }
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

  private async processCurrentQuestion(currentQuestion: QuizQuestion): Promise<void> {
    try {
      // Await the explanation text to ensure it resolves to a string
      const explanationText: string = await this.getExplanationText(this.currentQuestionIndex);
      
      // Set the current explanation text
      this.explanationTextService.setCurrentQuestionExplanation(explanationText);
      this.updateExplanationDisplay(true);
  
      const totalCorrectAnswers = this.quizService.getTotalCorrectAnswers(currentQuestion);
  
      // Update the quiz state with the latest question information
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        { isAnswered: true },
        totalCorrectAnswers
      );
    } catch (error) {
      console.error('Error processing current question:', error);
  
      // Set a fallback explanation text on error
      this.explanationTextService.setCurrentQuestionExplanation('Unable to load explanation.');
    }
  }

  private async updateExplanationDisplay(shouldDisplay: boolean): Promise<void> {
    this.explanationTextService.setShouldDisplayExplanation(shouldDisplay);
    this.showExplanationChange.emit(shouldDisplay);
    this.displayExplanation = shouldDisplay;
  
    if (shouldDisplay) {
      // Introduce a delay to avoid flickering
      setTimeout(async () => {
        try {
          const explanationText = await firstValueFrom(
            this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex)
          );
          this.explanationToDisplay = explanationText ?? 'No explanation available';
          this.explanationToDisplayChange.emit(this.explanationToDisplay);
          console.log(`Displayed explanation for question ${this.currentQuestionIndex}:`, explanationText);
          this.cdRef.markForCheck(); // Ensure UI reflects changes
        } catch (error) {
          console.error('Error fetching explanation:', error);
          this.explanationToDisplay = 'Error loading explanation.';
          this.explanationToDisplayChange.emit(this.explanationToDisplay);
        }
      }, 50); // Slight delay to avoid flicker
    } else {
      this.resetStateBeforeNavigation(); // Clear explanation when not displaying
    }
  }
 
  private resetStateBeforeNavigation(): void {
    this.currentQuestion = null;
    this.explanationToDisplay = '';
    this.explanationToDisplayChange.emit('');
    this.explanationTextService.updateFormattedExplanation('');
    this.showExplanationChange.emit(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
  }

  async updateExplanationText(questionIndex: number): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );
  
    if (questionState.isAnswered) {
      try {
        const explanationText = await this.getExplanationText(questionIndex);
        this.explanationToDisplayChange.emit(explanationText); // Emit the explanation text
        this.showExplanationChange.emit(true); // Emit the flag to show the explanation
      } catch (error) {
        console.error('Error fetching explanation text:', error);
        this.explanationToDisplayChange.emit('Error loading explanation.'); // Emit an error message
        this.showExplanationChange.emit(true); // Still show the explanation area with the error message
      }
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
    }, 1000); // Ensure audio has time to play before clearing
  }

  public async handleOptionSelection(
    option: SelectedOption,
    optionIndex: number,
    currentQuestion: QuizQuestion
  ): Promise<void> {  
    const questionIndex = this.currentQuestionIndex;
  
    // Ensure that the option and optionIndex are valid
    if (!option || optionIndex < 0) {
      console.error(
        `Invalid option or optionIndex: ${JSON.stringify(option)}, index: ${optionIndex}`
      );
      return;
    }
  
    // Ensure the question index is valid
    if (typeof questionIndex !== 'number' || questionIndex < 0) {
      console.error(`Invalid question index: ${questionIndex}`);
      return;
    }
  
    try {
      // Toggle option selection state
      option.selected = !option.selected;
      
      // Process the selected option and update states
      this.processOptionSelection(currentQuestion, option, optionIndex);
  
      this.selectedOptionService.setAnsweredState(true);
      this.selectedOptionService.setSelectedOption(option);
      this.selectedOptionService.toggleSelectedOption(
        questionIndex, 
        option, 
        this.isMultipleAnswer
      );
      this.selectedOptionService.updateSelectedOptions(
        questionIndex,
        optionIndex,
        'add'
      );
  
      this.selectedOption = { ...option, correct: option.correct };
      this.showFeedback = true;
  
      // Ensure the explanation text is only set after the option is selected
      const explanationText = await this.getExplanationText(this.currentQuestionIndex);
      this.explanationTextService.setExplanationText(explanationText);
      this.explanationText = explanationText;
  
      // Update the answers and check if the selection is correct
      this.quizService.updateAnswersForOption(option);
      this.checkAndHandleCorrectAnswer();
  
      const totalCorrectAnswers =
        this.quizService.getTotalCorrectAnswers(currentQuestion);
  
      // Update the question state in the QuizStateService
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        {
          selectedOptions: [option],
          isCorrect: option.correct ?? false,
        },
        totalCorrectAnswers
      );

      // Emit an event to notify the parent component that an option is selected
      this.optionSelected.emit({
        option: option,
        index: optionIndex,
        checked: option.selected
      });
  
      // Log debug information for further analysis
      this.logDebugInformation();
  
      // Display explanation text only if an option has been selected
      if (this.isAnswered || this.isOptionSelected) {
        await firstValueFrom(
          of(this.conditionallyShowExplanation(this.currentQuestionIndex))
        );
      }
      
      console.log('After option selection:', {
        selected: this.selectedOption,
        isAnswered: this.isAnswered,
        currentSelectedState: this.selectedOptionService.getCurrentOptionSelectedState()
      });
    } catch (error) {
      console.error('Error during option selection:', error);
    } finally {
      // Reset the answered state when a new option is selected
      this.isAnswered = false;
    }
  }
  

  private processOptionSelection(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    index: number
  ): void {
    this.handleOptionClicked(currentQuestion, index);

    // Check if the clicked option is selected
    const isOptionSelected =
      this.selectedOptionService.isSelectedOption(option);

    // Set shouldDisplayExplanation to true when an option is selected, otherwise set it to false
    this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
  }

  private logDebugInformation(): void {
    console.log('Answers:', this.answers);
  }

  private waitForQuestionData(): void {
    this.quizService.getQuestionByIndex(this.currentQuestionIndex).subscribe({
      next: (question) => {
        if (question && question.options?.length) {
          this.currentQuestion = question;
          console.log('Question data loaded:', question);
          this.initializeForm();
          this.questionForm.updateValueAndValidity(); // Ensure form is valid after loading
        } else {
          console.error('Invalid question data or options missing.');
        }
      },
      error: (error) => {
        console.error('Error loading question data:', error);
      }
    });
  }
  
  initializeForm(): void {
    if (!this.currentQuestion?.options?.length) {
      console.warn('Question data not ready or options are missing.');
      return;
    }
  
    const controls = this.currentQuestion.options.reduce((acc, option) => {
      console.log(`Initializing control for optionId: ${option.optionId}`);
      acc[option.optionId] = new FormControl(false);
      return acc;
    }, {});
  
    this.questionForm = this.fb.group(controls);
    console.log('Form initialized:', this.questionForm.value);
  
    this.questionForm.updateValueAndValidity();
    this.updateRenderComponentState();
    this.cdRef.detectChanges();
  }

  private updateFormControl(optionId: number, checked: boolean): void {
    const control = this.questionForm?.get(optionId.toString());
    if (!control) {
      console.warn(`Control not found for optionId: ${optionId}`);
      return;
    }
  
    control.setValue(checked, { emitEvent: true });
    control.markAsTouched();
  
    control.valueChanges.pipe(debounceTime(50)).subscribe(() => {
      this.questionForm.updateValueAndValidity();
    });
  
    this.cdRef.markForCheck();
  }

  private updateRenderComponentState(): void {
    // Check if both the form is valid and question data is available
    if (this.isFormValid()) {
     console.log('Both form and question data are ready, rendering component');
    this.shouldRenderComponent = true;
    } else {
      console.log('Form or question data is not ready yet');
    }
  }

  private isFormValid(): boolean {
    return this.questionForm?.valid ?? false; // Check form validity, ensure form is defined
  }

  private async checkAndHandleCorrectAnswer(): Promise<void> {
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
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

  private async handleQuestionData(
    data: QuizQuestion[],
    questionIndex: number
  ): Promise<void> {
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

    // Check if the question has been answered
    if (questionState && questionState.isAnswered) {
      // If answered, fetch and set the formatted explanation text for the question
      const explanationText = await this.getExplanationText(questionIndex);
      this.explanationTextService.setExplanationText(explanationText);
      this.explanationTextService.setShouldDisplayExplanation(true);
    } else {
      // If not answered, clear the explanation text and set the display flag to false
      this.explanationTextService.setShouldDisplayExplanation(false);
      // this.showExplanation = false;
      console.log(`Conditions for showing explanation not met.`);
    }
  }

  handleOptionClicked(
    currentQuestion: QuizQuestion,
    optionIndex: number
  ): void {
    const selectedOptions = this.selectedOptionService.getSelectedOptionIndices(
      this.currentQuestionIndex
    );
    const isOptionSelected = selectedOptions.includes(optionIndex);

    if (!isOptionSelected) {
      this.selectedOptionService.addSelectedOptionIndex(
        this.currentQuestionIndex,
        optionIndex
      );
    } else {
      this.selectedOptionService.removeSelectedOptionIndex(
        this.currentQuestionIndex,
        optionIndex
      );
    }

    this.updateSelectionMessage(true);
    this.handleMultipleAnswer(currentQuestion);

    // Ensure Angular change detection picks up state changes
    this.cdRef.markForCheck();
  }

  private handleMultipleAnswer(currentQuestion: QuizQuestion): void {
    this.quizStateService.isMultipleAnswerQuestion(currentQuestion).subscribe({
      next: () => {
        const selectedOptions =
          this.quizService.selectedOptionsMap.get(this.currentQuestionIndex) ||
          [];
        if (selectedOptions.length > 0) {
          this.fetchQuestionsArray(currentQuestion);
        } else {
          this.explanationTextService.explanationText$.next('');
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

  shouldShowIcon(option: Option): boolean {
    const selectedOption = this.selectedOptionService.getSelectedOption();
    const showFeedbackForOption = this.selectedOptionService.getShowFeedbackForOption();
  
    let shouldShow = false;
  
    // Check if selectedOption is an array (multiple selected options)
    if (Array.isArray(selectedOption)) {
      // Loop through each selected option and check if the current option should show icon
      shouldShow = selectedOption.some(
        (opt) => opt.optionId === option.optionId && showFeedbackForOption[option.optionId]
      );
    } else {
      // If selectedOption is a single object, perform a direct comparison
      shouldShow = selectedOption?.optionId === option.optionId && showFeedbackForOption[option.optionId];
    }
  
    console.log('Should show icon for option', option.optionId, ':', shouldShow);
    return shouldShow;
  }

  async selectOption(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    optionIndex: number
  ): Promise<void> {
    console.log('selectOption called with:', { currentQuestion, option, optionIndex });

    if (optionIndex < 0) {
      console.error(`Invalid optionIndex ${optionIndex}.`);
      return;
    }

    const selectedOption = {
      ...option,
      optionId: optionIndex,
      questionIndex: this.currentQuestionIndex,
    };
    this.showFeedbackForOption = { [selectedOption.optionId]: true };
    this.selectedOptionService.setSelectedOption(selectedOption);
    this.selectedOption = selectedOption;
    console.log('Selected Option:', this.selectedOption);

    this.explanationTextService.setIsExplanationTextDisplayed(true);

    this.quizStateService.setCurrentQuestion(currentQuestion);

    // Update the selected option in the quiz service and mark the question as answered
    this.selectedOptionService.updateSelectedOptions(
      this.currentQuestionIndex,
      optionIndex,
      'add'
    );

    // Update the selection message based on the new state
    const explanationText = await this.getExplanationText(this.currentQuestionIndex) || 'No explanation available';
    this.explanationTextService.setExplanationText(explanationText);

    // Notify the service to update the explanation text
    if (this.currentQuestion) {
      this.explanationTextService.updateExplanationText(this.currentQuestion);
    } else {
      console.error('Current question is not set.');
    }

    // Set the explanation text in the quiz question manager service
    this.quizQuestionManagerService.setExplanationText(
      currentQuestion.explanation || ''
    );

    // Emit events and update states after the option is selected
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit({ option, index: optionIndex, checked: true });

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions,
    });

    // Retrieve correct answers and set correct message
    const correctAnswers = this.optionsToDisplay.filter((opt) => opt.correct);
    this.quizService.setCorrectMessage(correctAnswers, this.optionsToDisplay);
  }

  unselectOption(): void {
    this.selectedOptions = [];
    this.optionChecked = {};
    this.showFeedbackForOption = {};
    this.showFeedback = false;
    this.selectedOption = null;
    this.quizQuestionManagerService.setExplanationText(null);
  }

  async manageExplanationDisplay(): Promise<void> {
    try {
      if (this.currentQuestionIndex === null || this.currentQuestionIndex === undefined) {
        throw new Error('Current question index is not set');
      }
  
      // Fetch the current question data
      const questionData = await firstValueFrom(this.quizService.getQuestionByIndex(this.currentQuestionIndex));
  
      if (!this.quizQuestionManagerService.isValidQuestionData(questionData)) {
        throw new Error('Invalid question data');
      }
  
      // Process the explanation text
      console.log(`Raw explanation for question ${this.currentQuestionIndex}:`, questionData.explanation);

      // Use the raw explanation as a fallback
      let explanationText = questionData.explanation ?? 'No explanation available';

      // Process the explanation text
      const processedExplanation = await this.processExplanationText(questionData, this.currentQuestionIndex);

      // Use the processed explanation if available
      if (processedExplanation && processedExplanation.explanation) {
        explanationText = processedExplanation.explanation;
      }
  
      // Update the explanation display properties
      this.explanationToDisplay = explanationText;
      this.explanationTextService.updateFormattedExplanation(explanationText);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.explanationToDisplayChange.emit(explanationText);
      this.showExplanationChange.emit(true);
      this.displayExplanation = true;
  
      console.log(`Explanation display updated for question ${this.currentQuestionIndex}:`, explanationText.substring(0, 50) + '...');
  
    } catch (error) {
      console.error('Error managing explanation display:', error);
      this.explanationToDisplay = 'Error loading explanation. Please try again.';
      this.displayExplanation = true;
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    } finally {
      // Ensure these flags are always set, even if an error occurs
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.displayExplanation = true;
    }
  }

  private resetExplanation(): void {
    this.displayExplanation = false;
    this.explanationToDisplay = '';
    this.explanationTextService.updateFormattedExplanation('');
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationToDisplayChange.emit('');
    this.showExplanationChange.emit(false);
  }

  async prepareAndSetExplanationText(questionIndex: number): Promise<string> {
    console.log('Preparing explanation text for question index:', questionIndex);
  
    if (document.hidden) {
      console.log('Document is hidden, returning placeholder text.');
      this.explanationToDisplay = 'Explanation text not available when document is hidden.';
      return this.explanationToDisplay;
    }
  
    try {
      const questionData = await firstValueFrom(this.quizService.getQuestionByIndex(questionIndex));
  
      if (this.quizQuestionManagerService.isValidQuestionData(questionData)) {
        const formattedExplanationObservable = this.explanationTextService.getFormattedExplanation(questionIndex);
        
        try {
          const formattedExplanation = await Promise.race([
            firstValueFrom(formattedExplanationObservable),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
          ]);
  
          if (formattedExplanation) {
            this.explanationToDisplay = formattedExplanation;
          } else {
            const rawExplanation = questionData.explanation ?? '';
            const processedExplanation = await this.processExplanationText(questionData, questionIndex);
            
            if (processedExplanation) {
              this.explanationToDisplay = processedExplanation.explanation;
              this.explanationTextService.updateFormattedExplanation(processedExplanation.explanation);
            } else {
              this.explanationToDisplay = 'No explanation available...';
            }
          }
        } catch (timeoutError) {
          console.error('Timeout while fetching formatted explanation:', timeoutError);
          this.explanationToDisplay = 'Explanation text unavailable at the moment.';
        }
      } else {
        console.error('Error: questionData is invalid');
        this.explanationToDisplay = 'No explanation available.';
      }
    } catch (error) {
      console.error('Error in fetching explanation text:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      this.explanationToDisplay = 'Error fetching explanation.';
    }
  
    return this.explanationToDisplay;
  }

  /* public async fetchAndSetExplanationText(): Promise<void> {
    console.log(`Fetching explanation for question ${this.currentQuestionIndex}`);

    // Reset the explanation text before fetching new one
    this.explanationToDisplay = '';
    this.manageExplanationDisplay();

    try {
      const explanationText = await this.prepareAndSetExplanationText(this.currentQuestionIndex);
      
      if (explanationText) {
        this.explanationToDisplay = explanationText;
        this.explanationTextService.updateFormattedExplanation(explanationText);
        console.log(`Set explanation for question ${this.currentQuestionIndex}:`, explanationText.substring(0, 50) + '...');
        
        // Update the UI with the explanation text
        this.updateExplanationUI(this.currentQuestionIndex, explanationText);
      } else {
        console.warn(`No explanation text found for question ${this.currentQuestionIndex}`);
        this.explanationToDisplay = 'No explanation available';
        
        // Update the UI with the default message
        this.updateExplanationUI(this.currentQuestionIndex, 'No explanation available');
      }

      // Call manageExplanationDisplay here
      this.manageExplanationDisplay();
  
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
    } catch (error) {
      console.error(`Error fetching explanation for question ${this.currentQuestionIndex}:`, error);
      this.explanationToDisplay = 'Error fetching explanation. Please try again.';

      this.manageExplanationDisplay();
      
      // Update the UI with the error message
      this.updateExplanationUI(this.currentQuestionIndex, this.explanationToDisplay);
      
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
    }
  } */
  /* public async fetchAndSetExplanationText(): Promise<void> {
    console.log(`Fetching explanation for question ${this.currentQuestionIndex}`);
  
    // Clear previous explanation immediately
    this.explanationToDisplay = '';
    this.manageExplanationDisplay();
  
    try {
      // Ensure Angular's zone runs smoothly and explanations don't overlap
      await this.ngZone.run(async () => {
        const currentIndex = this.currentQuestionIndex; // Capture the current index
  
        const explanationText = await this.prepareAndSetExplanationText(currentIndex);
  
        // Ensure the explanation matches the current question index to avoid flashing
        if (this.currentQuestionIndex === currentIndex) {
          this.explanationToDisplay = explanationText || 'No explanation available';
          this.explanationTextService.updateFormattedExplanation(this.explanationToDisplay);
  
          console.log(`Explanation for question ${currentIndex}:`, explanationText.substring(0, 50) + '...');
          this.updateExplanationUI(currentIndex, this.explanationToDisplay);
        } else {
          console.warn(`Explanation mismatch: expected ${currentIndex}, but found ${this.currentQuestionIndex}`);
        }
  
        this.manageExplanationDisplay();
        this.explanationToDisplayChange.emit(this.explanationToDisplay);
      });
    } catch (error) {
      console.error(`Error fetching explanation for question ${this.currentQuestionIndex}:`, error);
      this.explanationToDisplay = 'Error fetching explanation. Please try again.';
      this.updateExplanationUI(this.currentQuestionIndex, this.explanationToDisplay);
      this.manageExplanationDisplay();
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
    }
  } */
  /* public async fetchAndSetExplanationText(): Promise<void> {
    console.log(`Fetching explanation for question ${this.currentQuestionIndex}`);
  
    // Clear the current explanation text immediately
    this.explanationToDisplay = '';
  
    try {
      // Wait for the question data to be fully loaded
      await this.ensureQuestionIsFullyLoaded(this.currentQuestionIndex);
  
      // Fetch and prepare the explanation text
      const explanationText = await this.prepareAndSetExplanationText(this.currentQuestionIndex);
  
      // Set explanation text only if the index matches the current question
      if (this.currentQuestionIndex !== null) {
        this.explanationToDisplay = explanationText || 'No explanation available';
        this.explanationTextService.updateFormattedExplanation(this.explanationToDisplay);
        console.log(`Explanation set for question ${this.currentQuestionIndex}:`, explanationText.substring(0, 50) + '...');
      } else {
        console.warn('Question index mismatch. Skipping explanation update.');
      }
  
      // Emit events to update the UI
      this.updateExplanationUI(this.currentQuestionIndex, this.explanationToDisplay);
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
  
    } catch (error) {
      console.error(`Error fetching explanation for question ${this.currentQuestionIndex}:`, error);
      this.explanationToDisplay = 'Error fetching explanation. Please try again.';
      this.updateExplanationUI(this.currentQuestionIndex, this.explanationToDisplay);
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
    }
  } */
  public async fetchAndSetExplanationText(questionIndex: number): Promise<void> {
    console.log(`Fetching explanation for question ${questionIndex}`);
  
    // Clear the explanation text immediately
    this.explanationToDisplay = '';
    this.explanationTextService.updateFormattedExplanation('');
    this.showExplanationChange.emit(false);
  
    try {
      // Ensure the question data is fully loaded before fetching explanation
      await this.ensureQuestionIsFullyLoaded(questionIndex);

      // Debounce to ensure question text loads first
      await new Promise((resolve) => setTimeout(resolve, 100));
  
      // Fetch the correct explanation text for the current question
      const explanationText = await this.prepareAndSetExplanationText(questionIndex);
  
      if (this.currentQuestionIndex === questionIndex) {
        this.explanationToDisplay = explanationText || 'No explanation available';
        this.explanationTextService.updateFormattedExplanation(this.explanationToDisplay);
        
        // Emit events to update the UI
        this.updateExplanationUI(questionIndex, this.explanationToDisplay);
        this.explanationToDisplayChange.emit(this.explanationToDisplay);
        console.log(`Explanation set for question ${questionIndex}:`, explanationText.substring(0, 50) + '...');
      } else {
        console.warn('Question index mismatch. Skipping explanation update.');
      }
    } catch (error) {
      console.error(`Error fetching explanation for question ${questionIndex}:`, error);
      this.explanationToDisplay = 'Error fetching explanation. Please try again.';
      this.updateExplanationUI(questionIndex, this.explanationToDisplay);
      this.explanationToDisplayChange.emit(this.explanationToDisplay);
      this.showExplanationChange.emit(true);
    }
  }

  private async ensureQuestionIsFullyLoaded(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let subscription: Subscription; // Declare the subscription here
  
      try {
        subscription = this.quizService.getQuestionByIndex(index).subscribe({
          next: (question) => {
            if (question && question.questionText) {
              console.log(`Question loaded for index ${index}:`, question);
              subscription?.unsubscribe(); // Cleanup to avoid memory leaks
              resolve(); // Resolve the promise when the question is loaded
            }
          },
          error: (err) => {
            console.error(`Error loading question at index ${index}:`, err);
            subscription?.unsubscribe(); // Cleanup even on error
            reject(err); // Reject the promise to handle the error upstream
          }
        });
      } catch (error) {
        reject(error); // Ensure we reject if any unexpected error occurs
      }
    });
  }

  public async getExplanationText(questionIndex: number): Promise<string> {
    return await firstValueFrom(
      this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
    );
  }

  private async processExplanationText(
    questionData: QuizQuestion,
    questionIndex: number
  ): Promise<FormattedExplanation | null> {
    if (!questionData) {
      console.error(`Invalid question data for index ${questionIndex}`);
      return {
        questionIndex,
        explanation: 'No question data available'
      };
    }

    const explanation = questionData.explanation || 'No explanation available';
    this.explanationTextService.setCurrentQuestionExplanation(explanation);
  
    try {
      const formattedExplanation = await this.getFormattedExplanation(
        questionData,
        questionIndex
      );
      
      if (formattedExplanation) {
        const explanationText = typeof formattedExplanation === 'string' 
          ? formattedExplanation 
          : formattedExplanation.explanation || '';
        
        const formattedExplanationObject: FormattedExplanation = {
          questionIndex,
          explanation: explanationText
        };
        
        this.handleFormattedExplanation(formattedExplanationObject, formattedExplanationObject.questionIndex);
        return formattedExplanationObject;
      } else {
        console.warn('No formatted explanation received');
        return {
          questionIndex: questionIndex,
          explanation: questionData.explanation || 'No explanation available'
        };
      }
    } catch (error) {
      console.error('Error in processing explanation text:', error);
      return {
        questionIndex: questionIndex,
        explanation: questionData.explanation || 'Error processing explanation'
      };
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
    this.explanationTextService.explanationText$.next(explanationText);
    this.updateCombinedQuestionData(
      this.questions[questionIndex],
      explanationText
    );
    this.isAnswerSelectedChange.emit(true);
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
    this.questionAnswered.emit();
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

  private async processAnswer(
    selectedOption: SelectedOption
  ): Promise<boolean> {
    if (
      !selectedOption ||
      !this.currentQuestion.options.find(
        (opt) => opt.optionId === selectedOption.optionId
      )
    ) {
      console.error('Invalid or unselected option.');
      return false;
    }

    this.answers.push({
      question: this.currentQuestion,
      questionIndex: this.currentQuestionIndex,
      selectedOption: selectedOption,
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
      numberOfCorrectAnswers: numberOfCorrectAnswers,
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