import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ComponentRef, ComponentFactoryResolver, ElementRef, EventEmitter, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, Output, SimpleChange, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    options: Option[];
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

    this.initializeForm();

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
      .getTotalQuestions()
      .pipe(takeUntil(this.destroy$))
      .subscribe((totalQuestions: number) => {
        this.totalQuestions = totalQuestions;
      });
  }

  async ngOnInit(): Promise<void> {
    // super.ngOnInit();
    super.ngOnInit ? super.ngOnInit() : null;

    this.initializeData();
  
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
      console.warn('No options available. Initializing as empty array.');
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
          // Attempt to retrieve quizId from route or other sources
          this.quizId =
            this.activatedRoute.snapshot.paramMap.get('quizId') || this.quizId;
          if (!this.quizId) {
            console.error('Unable to retrieve Quiz ID, cannot fetch questions');
            return;
          }
        }

        try {
          await this.fetchAndProcessQuizQuestions(this.quizId);

          const isAnswered = await this.isQuestionAnswered(
            this.currentQuestionIndex
          );
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
    if (this.dynamicAnswerContainer) {
      this.dynamicAnswerContainer.clear();
  
      this.isMultipleAnswer = await firstValueFrom(
        this.quizStateService.isMultipleAnswerQuestion(this.question)
      );
  
      const componentRef: ComponentRef<BaseQuestionComponent> = await this.dynamicComponentService.loadComponent(
        this.dynamicAnswerContainer,
        this.isMultipleAnswer
      );
  
      if (componentRef.instance) {
        const instance = componentRef.instance as BaseQuestionComponent;
        instance.questionForm = this.questionForm;
        instance.question = this.question;
        instance.optionsToDisplay = [...this.optionsToDisplay];
  
        instance.quizQuestionComponentOnOptionClicked = this.onOptionClicked.bind(this);
  
        if (typeof instance.onOptionClicked === 'undefined') {
          console.log('Setting onOptionClicked in dynamic component');
          instance.onOptionClicked = this.onOptionClicked.bind(this);
        } else {
          console.warn('onOptionClicked is already defined on the dynamic component');
        }
  
        componentRef.changeDetectorRef.markForCheck();
        console.log('Change detection triggered for dynamic component');
      } else {
        console.error('Component instance is undefined');
      }
    } else {
      console.error('dynamicAnswerContainer is still undefined in QuizQuestionComponent');
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
    this.resetExplanation();
    this.resetTexts();
    this.isLoading = true;
    // this.quizStateService.setLoading(true);
    // this.quizStateService.setLoading(false);

    this.quizStateService.setLoading(true);
    this.quizStateService.setAnswered(false);
  
    // Clear previous data
    this.currentQuestion = null;
    this.optionsToDisplay = [];
    this.feedbackText = '';
  
    try {
      // Ensure we have a valid quiz ID
      const quizId = this.quizService.getCurrentQuizId();
      if (!quizId) {
        throw new Error('No active quiz ID found');
      }
  
      // Fetch the current question
      this.currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestionByIndex(quizId, this.currentQuestionIndex)
      );
      
      if (!this.currentQuestion) {
        throw new Error(`No question found for index ${this.currentQuestionIndex}`);
      }
  
      // Set options to display
      this.optionsToDisplay = this.currentQuestion.options || [];
  
      if (signal?.aborted) {
        console.log('Load question operation aborted.');
        return;
      }

      // Only display the explanation if the question has been answered
      if (this.isAnswered) {
        await this.fetchAndSetExplanationText();
        this.updateExplanationDisplay(true);
      } else {
        this.updateExplanationDisplay(false);
      }
  
      // Update the selection message
      this.updateSelectionMessage(false);
  
    } catch (error) {
      console.error('Error loading question:', error);
      this.feedbackText = 'Error loading question. Please try again.';
    } finally {
      this.isLoading = false;
      this.quizStateService.setLoading(false);
      // console.log('Question loading completed');
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
    if (!this.currentQuestion) {
      console.warn('Current question is not available.');
      return;
    }
  
    if (!this.data) {
      this.data = {
        questionText: this.currentQuestion.questionText,
        explanationText: this.currentQuestion.explanation,
        correctAnswersText: this.quizService.getCorrectAnswersAsString(),
        options: this.currentQuestion.options || []
      };
    }
  
    console.log('Data initialized:', this.data);
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
          console.log('isAnswered after option selection:', isAnswered);
  
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
    console.log('Data to be passed to fetchCorrectAnswersText:', this.data);
    console.log('questionData:::', this.questionData || 'Not available');
    console.log('MY CORR MSG', this.correctMessage || 'Not available');
  }  

  public getCorrectAnswers(): number[] {
    // Check if the current question index has changed to decide whether to fetch new answers
    if (this.currentQuestionIndex !== this.previousQuestionIndex) {
      try {
        // Fetch correct answers from the service
        this.correctAnswers = this.quizService.getCorrectAnswers(
          this.currentQuestion
        );
        // Update previousQuestionIndex after fetching
        this.previousQuestionIndex = this.currentQuestionIndex;
      } catch (error) {
        console.error(
          'QuizQuestionComponent - Error getting correct answers:',
          error
        );
        this.correctAnswers = [];
      }
    }

    return this.correctAnswers;
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

  public override async onOptionClicked(
    option: SelectedOption,
    index: number,
    checked: boolean
  ): Promise<void> {
    console.log("MYTEST123456");
    console.log('onOptionClicked called with:', { option, index, checked });
  
    if (!option) {
      console.error('Option is undefined');
      return;
    }
  
    try {
      // Call the base class method (ensure this works correctly in BaseQuestionComponent)
      await super.onOptionClicked(option, index, checked);
  
      this.displayExplanation = false; // Reset explanation display
  
      const isChecked = !option.selected; // Toggle the checked state
      option.selected = isChecked; // Update the option's selected state
  
      // Emit the selected option event
      this.optionSelected.emit({ option, index, checked: isChecked });
  
      // Set loading and reset answer selection state
      this.quizStateService.setLoading(true);
      this.quizStateService.setAnswerSelected(false);
  
      // Subscribe to check if the question is a multiple answer type
      this.quizStateService.isMultipleAnswerQuestion(this.currentQuestion).subscribe({
        next: (isMultipleAnswer: boolean) => {
          // Update the selected option state based on multiple answer question
          this.selectedOptionService.setSelectedOption(option);
          this.selectedOptionService.selectOption(
            option.optionId,
            this.currentQuestionIndex,
            option.text,
            isMultipleAnswer
          );
      
          this.selectedOptionService.toggleSelectedOption(
            this.currentQuestionIndex,
            option,
            isMultipleAnswer
          );
        },
        error: (error) => {
          console.error('Error determining if the question is multiple answer:', error);
        }
      });
  
      // Mark the question as answered
      this.selectedOptionService.isAnsweredSubject.next(true);
  
      // Ensure loading state is started
      if (!this.quizStateService.isLoading()) {
        this.quizStateService.startLoading();
      }
  
      // Initialize question state and set it as answered
      const questionState = this.initializeQuestionState();
      questionState.isAnswered = true;
  
      // Set answer selected state if not already set
      if (!this.quizStateService.isAnswered$) {
        this.quizStateService.setAnswerSelected(true);
      }
  
      // Handle the processing and feedback for the selected option
      await this.handleOptionProcessingAndFeedback(option, index, checked);
      await this.updateQuestionState(option);
  
      // Handle correct answers and update feedback
      this.handleCorrectAnswers(option);
      this.updateFeedback(option);
  
      // Finalize the option selection process
      await this.finalizeOptionSelection(option, index, questionState);
    } catch (error) {
      // Handle any errors that occur during the process
      this.handleError(error);
    } finally {
      // Finalize the loading state
      this.finalizeLoadingState();
    }
  }  

  private initializeQuestionState(): QuestionState {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndex);
    questionState.isAnswered = false;
    return questionState;
  }

  private async handleOptionProcessingAndFeedback(option: SelectedOption, index: number, checked: boolean): Promise<void> {
    console.log(`Handling option processing and feedback for question ${this.currentQuestionIndex}, option ${index}`);
  
    try {
      await super.onOptionClicked(option, index, checked);
  
      this.selectedOptions = [{ ...option, questionIndex: this.currentQuestionIndex }];
      this.selectedOption = { ...option, optionId: index + 1 };
      this.showFeedback = true;
      this.showFeedbackForOption[option.optionId] = true;
  
      // The question is now answered
      this.isAnswered = true;
  
      // Fetch and set the explanation text
      await this.fetchAndSetExplanationText();
      
      // Update the explanation display
      this.updateExplanationDisplay(true);
  
      // Fetch the current question data again to ensure we have the most up-to-date information
      const questionData = await firstValueFrom(this.quizService.getQuestionByIndex(this.currentQuestionIndex));
      
      console.log(`Current question data:`, JSON.stringify(questionData, null, 2));
  
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

  private handleCorrectAnswers(option: SelectedOption): void {
    if (this.correctAnswers && this.correctAnswers.length > 0) {
      console.log('Correct answers:', this.correctAnswers);
      for (const answer of this.correctAnswers) {
        console.log('Correct answer:', answer);
      }
      const correctAnswerCount = this.correctAnswers.length;
      console.log('Number of correct answers:', correctAnswerCount);
      const isSpecificAnswerCorrect = this.correctAnswers.includes(option.optionId);
      console.log('Is the specific answer correct?', isSpecificAnswerCorrect);
    } else {
      console.warn('No correct answers available for this question.');
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

    // this.processCurrentQuestionState(currentQuestion, option, index);

    await this.handleCorrectnessAndTimer();
  }

  private handleError(error: Error): void {
    console.error(
      'An error occurred while processing the option click:',
        error
    );
  }

  private finalizeLoadingState(): void {
    this.quizStateService.setLoading(false);
    console.log('Loading state reset in finally block.');
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
      text: option.text,
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

      if (!currentQuestion) {
        return null;
      }

      this.currentQuestion = currentQuestion;
      this.optionsToDisplay = [...(currentQuestion.options || [])];

      // Set this.data
      this.data = {
        questionText: currentQuestion.questionText,
        explanationText: currentQuestion.explanation,
        correctAnswersText: this.quizService.getCorrectAnswersAsString(),
        options: this.optionsToDisplay,
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
    // this.handleOptionSelection(option, index, currentQuestion);
    this.quizStateService.updateQuestionStateForExplanation(
      this.quizId,
      this.currentQuestionIndex
    );
    this.formatAndLogExplanations();
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

  private async processCurrentQuestion(
    currentQuestion: QuizQuestion
  ): Promise<void> {
    this.explanationTextService.setShouldDisplayExplanation(true);
  
    try {
      const explanationText = await this.getExplanationText(this.currentQuestionIndex);  
      this.explanationTextService.setCurrentQuestionExplanation(explanationText);
      this.updateExplanationDisplay(true);
  
      const totalCorrectAnswers =
        this.quizService.getTotalCorrectAnswers(currentQuestion);
      this.quizStateService.updateQuestionState(
        this.quizId,
        this.currentQuestionIndex,
        { isAnswered: true },
        totalCorrectAnswers
      );
    } catch (error) {
      console.error('Error processing current question:', error);
      // Handle the error appropriately, maybe set a default explanation
      this.explanationTextService.setCurrentQuestionExplanation('Unable to load explanation.');
    }
  }

  private updateExplanationDisplay(shouldDisplay: boolean): void {
    this.explanationTextService.setShouldDisplayExplanation(shouldDisplay);
    this.showExplanationChange.emit(shouldDisplay);
    this.displayExplanation = shouldDisplay;
  
    if (shouldDisplay) {
      this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex)
        .pipe(
          tap((explanationText: string) => {
            this.explanationToDisplay = explanationText ?? 'No explanation available';
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
            console.log(`Displaying explanation for question ${this.currentQuestionIndex}`);
          }),
          catchError((error) => {
            console.error('Error fetching explanation:', error);
            this.explanationToDisplay = 'Error loading explanation.';
            this.explanationToDisplayChange.emit(this.explanationToDisplay);
            return of(null); // Return an observable to continue the stream
          })
        )
        .subscribe();
    } else {
      this.explanationToDisplay = '';
      console.log(`Explanation for question ${this.currentQuestionIndex} is not displayed`);
    }
  }

  private formatAndLogExplanations(): void {
    const explanations = this.explanationTextService.getFormattedExplanations();
    console.log('Formatted Explanations on click:', explanations);
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
    console.log("MY HANDLE OPTION SELECTION");
    console.log('Option selected:', option);
    console.log('Index:', optionIndex);
    console.log('Current question:', currentQuestion);
    const questionIndex = this.currentQuestionIndex;

    // Ensure that optionIndex is being received correctly
    if (typeof optionIndex === 'undefined') {
      console.error('optionIndex is undefined.');
      return;
    }

    console.log('Option selected:', option);
    console.log('Option index:', optionIndex);

    // Process the option selection
    this.processOptionSelection(currentQuestion, option, optionIndex);

    this.selectedOptionService.setAnsweredState(true);
    this.selectedOptionService.setSelectedOption(option);
    this.selectedOptionService.toggleSelectedOption(questionIndex, option, this.isMultipleAnswer);
    this.selectedOptionService.updateSelectedOptions(
      questionIndex,
      optionIndex,
      'add'
    );

    this.selectedOption = { ...option, correct: option.correct };
    this.showFeedback = true;

    // Update answers for option
    this.quizService.updateAnswersForOption(option);

    // Check and handle correct answer
    this.checkAndHandleCorrectAnswer();

    // Log debug information
    this.logDebugInformation();

    const totalCorrectAnswers =
      this.quizService.getTotalCorrectAnswers(currentQuestion);

    // Update the state to reflect the selected option
    this.quizStateService.updateQuestionState(
      this.quizId,
      this.currentQuestionIndex,
      {
        selectedOptions: [option],
        isCorrect: option.correct ?? false,
      },
      totalCorrectAnswers
    );

    // Decide whether to show the explanation based on the current question index
    await firstValueFrom(
      of(this.conditionallyShowExplanation(this.currentQuestionIndex))
    );

    // Fetch and store the explanation text using the ExplanationTextService
    const explanationText = await this.getExplanationText(this.currentQuestionIndex);
    this.explanationTextService.setExplanationText(explanationText);
    this.explanationText = explanationText;

    // Ensure showFeedback remains true
    this.showFeedback = true;

    // Reset answered state when a new option is selected
    this.isAnswered = false;

    console.log('After option selection:', {
      selected: this.selectedOption,
      isAnswered: this.isAnswered,
      currentSelectedState: this.selectedOptionService.getCurrentOptionSelectedState()
    });
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

  initializeForm(): void {
    this.questionForm = this.fb.group({});
    
    this.updateRenderComponentState();
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
    this.explanationToDisplay = '';
    this.explanationTextService.updateFormattedExplanation('');
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationToDisplayChange.emit('');
    this.showExplanationChange.emit(false);
    this.displayExplanation = false;
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

  public async fetchAndSetExplanationText(): Promise<void> {
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
    this.explanationTextService.setCurrentQuestionExplanation(
      questionData.explanation || ''
    );
  
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
          questionIndex: questionIndex,
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