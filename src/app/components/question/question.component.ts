import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChange,
  SimpleChanges,
  ViewChild,
  ViewContainerRef,
  ComponentFactoryResolver,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BehaviorSubject,
  firstValueFrom,
  Observable,
  of,
  ReplaySubject,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { TestComponent } from './test.component';
import { BaseQuestionComponent } from './base-question.component';
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
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
import { ResetFeedbackIconService } from '../../shared/services/reset-feedback-icon.service';
import { ResetStateService } from '../../shared/services/reset-state.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';
import { TimerService } from '../../shared/services/timer.service';
import { MultipleAnswerComponent } from './question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from './question-type/single-answer/single-answer.component';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionComponent
  extends BaseQuestionComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewInit
{
  @ViewChild('dynamicComponentContainer', {
    read: ViewContainerRef,
    static: true,
  })
  dynamicComponentContainer!: ViewContainerRef;
  // @ViewChild('dynamicComponentContainer', { static: true }) dynamicComponentContainer!: ElementRef;
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() optionSelected: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() questionAnswered: EventEmitter<boolean> =
    new EventEmitter<boolean>();
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
  @Input() data: {
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    options: Option[];
  };
  @Input() questionData: QuizQuestion;
  @Input() question!: QuizQuestion;
  /* question: QuizQuestion = {
    text: 'Sample question?',
    options: [
      { text: 'Option 1', correct: false } as Option,
      { text: 'Option 2', correct: true } as Option,
      { text: 'Option 3', correct: false } as Option
    ]
  }; */
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[] = [];
  // optionsToDisplay: Option[] = this.question.options;
  @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex: number = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  // @Input() multipleAnswer: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  multipleAnswer = new BehaviorSubject<boolean>(false);
  @Input() explanationText: string | null;
  @Input() isOptionSelected = false;
  @Input() showFeedback = false;
  @Input() selectionMessage: string;
  @Input() reset: boolean;

  combinedQuestionData$: Subject<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
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
  feedbackIcon: string;
  feedbackVisible: { [optionId: number]: boolean } = {};
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  displayOptions: Option[] = [];
  correctAnswersLoaded = false;
  resetFeedbackSubscription: Subscription;
  resetStateSubscription: Subscription;
  sharedVisibilitySubscription: Subscription;
  optionSelectionSubscription: Subscription;
  isExplanationTextDisplayed = false;
  isNavigatingToPrevious = false;
  isLoading = true;
  isLoadingQuestions = false;
  isFirstQuestion = true;
  isPaused = false;
  isComponentDestroyed = false;
  lastMessage = '';
  private initialized = false;
  feedbackForOption: boolean;

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
    protected explanationTextService: ExplanationTextService,
    protected resetBackgroundService: ResetBackgroundService,
    protected resetFeedbackIconService: ResetFeedbackIconService,
    protected resetStateService: ResetStateService,
    protected selectedOptionService: SelectedOptionService,
    protected selectionMessageService: SelectionMessageService,
    protected sharedVisibilityService: SharedVisibilityService,
    protected timerService: TimerService,
    protected componentFactoryResolver: ComponentFactoryResolver,
    protected activatedRoute: ActivatedRoute,
    protected fb: FormBuilder,
    protected cdRef: ChangeDetectorRef,
    protected router: Router,
    protected ngZone: NgZone
  ) {
    super(componentFactoryResolver, fb);
    this.quizService = quizService;
    this.quizDataService = quizDataService;
    this.quizStateService = quizStateService;
    this.quizQuestionManagerService = quizQuestionManagerService;
    this.explanationTextService = explanationTextService;
    this.resetBackgroundService = resetBackgroundService;
    this.resetFeedbackIconService = resetFeedbackIconService;
    this.resetStateService = resetStateService;
    this.selectedOptionService = selectedOptionService;
    this.selectionMessageService = selectionMessageService;
    this.sharedVisibilityService = sharedVisibilityService;
    this.timerService = timerService;

    this.questionForm = this.fb.group({});

    /* this.sharedVisibilitySubscription =
      this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
        this.handlePageVisibilityChange(isHidden);
      }); */

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
    console.log('QuizQuestionComponent initialized');
    console.log('ngOnInit:', this.dynamicComponentContainer);
    
    const hasMultipleAnswers =
      this.currentQuestion.options.filter((option) => option.correct).length >
      1;
    this.multipleAnswer.next(hasMultipleAnswers);

    const component = this.multipleAnswer.value ? MultipleAnswerComponent : SingleAnswerComponent;
    this.loadDynamicComponent(component);

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

            this.loadQuestion();
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
        console.error('No questions were loaded');
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
      this.loadOptions();
      this.setCorrectMessage([]);
      document.addEventListener(
        'visibilitychange',
        this.onVisibilityChange.bind(this)
      );
      this.logInitialData();
      this.logFinalData();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const isSubsequentChange = (change: SimpleChange) =>
      change && !change.firstChange;

    // Check for changes in correctAnswers or selectedOptions
    if (
      isSubsequentChange(changes.correctAnswers) ||
      isSubsequentChange(changes.selectedOptions)
    ) {
      if (this.currentQuestion) {
        this.getCorrectAnswers();
        this.correctMessage = this.setCorrectMessage(
          this.quizService.correctAnswerOptions
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
    document.removeEventListener(
      'visibilitychange',
      this.onVisibilityChange.bind(this)
    );
    this.isComponentDestroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.optionSelectionSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
    this.resetFeedbackSubscription?.unsubscribe();
    this.resetStateSubscription?.unsubscribe();
  }

  // Function to handle visibility changes
  private onVisibilityChange(): void {
    if (!document.hidden) {
      this.ngZone.run(async () => {
        await this.fetchAndProcessQuizQuestions(this.quizId);
        const isAnswered = await this.isQuestionAnswered(
          this.currentQuestionIndex
        );
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      });
    }
  }

  loadQuestion(): void {
    this.resetState();

    if (!this.questionsArray || this.questionsArray.length === 0) {
      console.error('Questions are not available yet');
      return;
    }
    const currentQuestion = this.questionsArray[this.currentQuestionIndex];
    if (!currentQuestion) {
      console.error('Current question is undefined');
      return;
    }

    this.options = currentQuestion.options.map((option, index) => ({
      ...option,
      optionId: index,
    }));

    this.displayOptions = this.getDisplayOptions();
    this.showFeedbackForOption = this.displayOptions.reduce((acc, option) => {
      acc[option.optionId] = false;
      return acc;
    }, {} as { [optionId: number]: boolean });

    console.log('Initial showFeedbackForOption:', this.showFeedbackForOption);

    if (this.isQuestionAnswered(this.currentQuestionIndex)) {
      this.explanationTextService.updateExplanationText(currentQuestion);
    }
  }

  // Load options and set displayOptions
  loadOptions(): void {
    if (
      !this.quiz ||
      !this.quiz.questions ||
      this.quiz.questions.length === 0
    ) {
      console.error('Quiz or questions are not properly initialized');
      return;
    }

    const currentQuestion = this.quiz.questions[this.currentQuestionIndex];
    if (!currentQuestion || !currentQuestion.options) {
      console.error('Current question is undefined or has no options');
      return;
    }

    this.options = currentQuestion.options.map((option, index) => ({
      ...option,
      optionId: index,
    }));

    this.displayOptions = this.getDisplayOptions();
    this.showFeedbackForOption = this.displayOptions.reduce((acc, option) => {
      acc[option.optionId] = false;
      return acc;
    }, {} as { [optionId: number]: boolean });

    console.log('Initial showFeedbackForOption:', this.showFeedbackForOption);
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
            questions.forEach((quizQuestion: QuizQuestion) => {
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
            });
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

      // this.initializeCorrectAnswerOptions();
      // this.subscribeToCorrectAnswers();
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }

  private async fetchAndProcessQuizQuestions(
    quizId: string
  ): Promise<QuizQuestion[]> {
    this.isLoading = true;

    try {
      const questions = await this.quizService.fetchQuizQuestions(quizId);

      if (questions && questions.length > 0) {
        this.questions = of(questions);

        // Ensure option IDs are set
        questions.forEach((question, qIndex) => {
          if (question.options) {
            question.options.forEach((option, oIndex) => {
              option.optionId = oIndex;
            });
          } else {
            console.error(
              `Options are not properly defined for question: ${question.questionText}`
            );
          }
        });

        // Handle explanation texts for previously answered questions
        questions.forEach((question, index) => {
          const state = this.quizStateService.getQuestionState(quizId, index);
          if (state?.isAnswered) {
            const formattedExplanationText: FormattedExplanation = {
              questionIndex: index,
              explanation:
                this.explanationTextService.getFormattedExplanationTextForQuestion(
                  index
                ),
            };
            this.explanationTextService.formattedExplanations[index] =
              formattedExplanationText;
          }
        });

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
    const data = {
      questionText: this.data.questionText,
      correctAnswersText: this.data.correctAnswersText || '',
      currentOptions: this.data.options,
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
      const currentCorrectAnswers = this.quizService.correctAnswers.get(
        data.questionText
      );
      if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
        await firstValueFrom(
          this.quizService.setCorrectAnswers(
            this.currentQuestion,
            currentOptions
          )
        );
        this.correctAnswers = this.quizService.correctAnswers.get(
          data.questionText
        );
      }
    } catch (error) {
      console.error('Error in fetchCorrectAnswersAndText:', error);
    }
  }

  // for generic form
  getOptionsForQuestion(): Option[] {
    return this.currentQuestionIndex === this.previousQuestionIndex
      ? this.optionsToDisplay
      : this.data?.options;
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
        this.currentQuestion.options.forEach((option) => {
          option.selected = false;
          option.styleClass = '';
        });
      }
    }
  }

  private resetState(): void {
    this.resetFeedback();
    this.selectedOptionService.clearOptions();
  }

  public resetFeedback(): void {
    console.log('QuizQuestionComponent - resetFeedback - Before reset:', {
      correctMessage: this.correctMessage,
      showFeedback: this.showFeedback,
      selectedOption: this.selectedOption,
      showFeedbackForOption: this.showFeedbackForOption,
    });

    this.correctMessage = '';
    this.showFeedback = false;
    this.selectedOption = null;
    this.showFeedbackForOption = {};

    console.log('QuizQuestionComponent - resetFeedback - After reset:', {
      correctMessage: this.correctMessage,
      showFeedback: this.showFeedback,
      selectedOption: this.selectedOption,
      showFeedbackForOption: this.showFeedbackForOption,
    });
  }

  setCorrectMessage(correctOptions: Option[]): string {
    if (!correctOptions || correctOptions.length === 0) {
      return 'No correct answers found for the current question.';
    }

    const correctOptionIndices = correctOptions.map((correctOption) => {
      const originalIndex = this.optionsToDisplay.findIndex(
        (option) => option.text === correctOption.text
      );
      return originalIndex + 1; // +1 to make it 1-based index for display
    });

    const uniqueIndices = [...new Set(correctOptionIndices)]; // Remove duplicates if any
    const optionsText =
      uniqueIndices.length === 1 ? 'answer is Option' : 'answers are Options';
    const optionStrings =
      uniqueIndices.length > 1
        ? uniqueIndices.slice(0, -1).join(', ') +
          ' and ' +
          uniqueIndices.slice(-1)
        : `${uniqueIndices[0]}`;

    return `The correct ${optionsText} ${optionStrings}.`;
  }

  // Call this method when an option is selected
  protected async onOptionClicked(
    option: SelectedOption,
    index: number
  ): Promise<void> {
    this.showFeedbackForOption[index] = true;
    try {
      // Set selected option and show feedback
      this.selectedOptions = [
        { ...option, questionIndex: this.currentQuestionIndex },
      ];
      this.selectedOption = { ...option, optionId: index + 1 };
      this.showFeedback = true;
      this.showFeedbackForOption = { [this.selectedOption.optionId]: true };
      this.updateFeedbackForOption(option);

      console.log(
        'onOptionClicked - showFeedbackForOption:',
        this.showFeedbackForOption
      );
      console.log('onOptionClicked - SelectedOption set:', this.selectedOption);

      // Update selected option in service
      this.updateSelectedOption(option);
      this.selectedOptionService.setOptionSelected(true);
      this.selectedOptionService.setSelectedOption(option);

      // Fetch and process current question
      const currentQuestion = await this.fetchAndProcessCurrentQuestion();
      if (!currentQuestion) {
        console.error('Could not retrieve the current question.');
        return;
      }
      this.selectOption(currentQuestion, option, index);

      // Update selection message based on answer state
      const isAnswered = true;
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
      }

      this.cdRef.detectChanges();

      // Process state changes
      this.processCurrentQuestionState(currentQuestion, option, index);
      const correctOptions = this.optionsToDisplay.filter((opt) => opt.correct);
      this.correctMessage = this.setCorrectMessage(correctOptions);

      // Handle correctness and timer
      await this.handleCorrectnessAndTimer();
    } catch (error) {
      console.error(
        'An error occurred while processing the option click:',
        error
      );
    }
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
    this.isOptionSelected = false;
    this.selectedOptionService.setOptionSelected(false);
    this.selectedOptionService.clearSelectedOption();
    this.selectedOptionService.resetAnsweredState();
    this.selectionMessage = 'Please select an option to continue...';
    this.selectionMessageService.updateSelectionMessage(this.selectionMessage);
    this.selectionMessageService.resetMessage();
  }

  private updateSelectedOption(option: SelectedOption): void {
    const selectedOption: SelectedOption = {
      optionId: option.optionId,
      questionIndex: this.currentQuestionIndex,
      text: option.text,
    };
    this.selectedOptionService.toggleSelectedOption(
      this.currentQuestionIndex,
      selectedOption
    );
    this.selectedOptionService.setOptionSelected(true);
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

      if (this.selectionMessage !== newMessage) {
        this.selectionMessage = newMessage;
        this.selectionMessageService.updateSelectionMessage(newMessage);
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

  private async fetchAndProcessCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      // Attempt to fetch the current question
      const currentQuestion = await firstValueFrom(
        this.quizService.getCurrentQuestion()
      );

      if (!currentQuestion) {
        console.error(
          '[fetchAndProcessCurrentQuestion] Could not retrieve the current question.'
        );
        return null;
      }

      // Determine if the current question is answered
      const isAnswered = await this.isQuestionAnswered(
        this.currentQuestionIndex
      );

      // Update the selection message based on the current state
      if (this.shouldUpdateMessageOnAnswer(isAnswered)) {
        await this.updateSelectionMessageBasedOnCurrentState(isAnswered);
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
    this.processCurrentQuestion(currentQuestion);
    this.handleOptionSelection(option, index, currentQuestion);
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

    const explanationText = await firstValueFrom(
      of(
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          this.currentQuestionIndex
        )
      )
    );
    this.explanationTextService.setCurrentQuestionExplanation(explanationText);

    const totalCorrectAnswers =
      this.quizService.getTotalCorrectAnswers(currentQuestion);
    this.quizStateService.updateQuestionState(
      this.quizId,
      this.currentQuestionIndex,
      { isAnswered: true },
      totalCorrectAnswers
    );
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
    }, 1000); // Ensure audio has time to play before clearing
  }

  public async handleOptionSelection(
    option: SelectedOption,
    optionIndex: number,
    currentQuestion: QuizQuestion
  ): Promise<void> {
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
    this.selectedOptionService.toggleSelectedOption(questionIndex, option);
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
    const explanationText =
      this.explanationTextService.getFormattedExplanationTextForQuestion(
        this.currentQuestionIndex
      );
    this.explanationTextService.setExplanationText(explanationText);
    this.explanationText = explanationText;
    console.log(
      'Explanation text for question',
      this.currentQuestionIndex,
      ':',
      this.explanationText
    );

    // Ensure showFeedback remains true
    this.showFeedback = true;
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

  private handleQuestionData(
    data: QuizQuestion[],
    questionIndex: number
  ): void {
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
      const explanationText =
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );
      this.explanationTextService.setExplanationText(explanationText);
      //this.explanationToDisplay = explanationText;
      this.explanationTextService.setShouldDisplayExplanation(true);
      //this.showExplanation = true;
    } else {
      // If not answered, clear the explanation text and set the display flag to false
      //this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
      //this.showExplanation = false;
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

  shouldShowIcon(option: Option): boolean {
    const selectedOption = this.selectedOptionService.getSelectedOption();
    const showFeedbackForOption =
      this.selectedOptionService.getShowFeedbackForOption();
    const shouldShow =
      selectedOption &&
      selectedOption.optionId === option.optionId &&
      showFeedbackForOption[option.optionId];
    console.log(
      'Should show icon for option',
      option.optionId,
      ':',
      shouldShow
    );
    return shouldShow;
  }

  selectOption(
    currentQuestion: QuizQuestion,
    option: SelectedOption,
    optionIndex: number
  ): void {
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
    const explanationText =
      this.explanationTextService.getFormattedExplanationTextForQuestion(
        this.currentQuestionIndex
      ) || 'No explanation available';
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
    this.optionSelected.emit(this.isOptionSelected);

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions,
    });

    // Retrieve correct answers and set correct message
    const correctAnswers = this.optionsToDisplay.filter((opt) => opt.correct);
    this.setCorrectMessage(correctAnswers);
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

  /* loadDynamicComponent() {
    console.log('Loading dynamic component');
    const component = this.multipleAnswer
      ? MultipleAnswerComponent
      : SingleAnswerComponent;
    const componentFactory =
      this.componentFactoryResolver.resolveComponentFactory(component);
    console.log('ComponentFactory:', componentFactory);
    this.dynamicComponentContainer.clear();
    const componentRef =
      this.dynamicComponentContainer.createComponent(componentFactory);
    console.log('ComponentRef:', componentRef);
    componentRef.instance.questionForm = this.questionForm;
    componentRef.instance.question = this.question;
    componentRef.instance.optionsToDisplay = this.optionsToDisplay;
  } */
}

