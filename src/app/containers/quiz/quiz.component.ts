import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, forkJoin, lastValueFrom, merge, Observable, of, Subject, Subscription, throwError } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, retry, shareReplay, startWith, switchMap, take, takeUntil, tap } from 'rxjs/operators';
import { MatTooltip } from '@angular/material/tooltip';

import { Utils } from '../../shared/utils/utils';
import { QuizRoutes } from '../../shared/models/quiz-routes.enum';
import { QuizStatus } from '../../shared/models/quiz-status.enum';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuizData } from '../../shared/models/QuizData.model';
import { QuestionState } from '../../shared/models/QuestionState.model';
import { CombinedQuestionDataType } from '../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizComponentData } from '../../shared/models/QuizComponentData.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { Resource } from '../../shared/models/Resource.model';
import { SelectedOption } from '../../shared/models/SelectedOption.model';
import { QuizQuestionComponent } from '../../components/question/quiz-question/quiz-question.component';
import { SharedOptionComponent } from '../../components/question/answer/shared-option-component/shared-option.component';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
import { QuizStateService } from '../../shared/services/quizstate.service';
import { QuizQuestionManagerService } from '../../shared/services/quizquestionmgr.service';
import { ExplanationTextService } from '../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';
import { SelectionMessageService } from '../../shared/services/selection-message.service';
import { TimerService } from '../../shared/services/timer.service';
import { ProgressBarService } from '../../shared/services/progress-bar.service';
import { ResetStateService } from '../../shared/services/reset-state.service';
import { ResetBackgroundService } from '../../shared/services/reset-background.service';
import { SharedVisibilityService } from '../../shared/services/shared-visibility.service';
import { UserPreferenceService } from '../../shared/services/user-preference.service';
import { ChangeRouteAnimation } from '../../animations/animations';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'codelab-quiz-component',
  templateUrl: './quiz.component.html',
  styleUrls: ['./quiz.component.scss'],
  animations: [ChangeRouteAnimation.changeRoute],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    QuizService,
    QuizDataService,
    QuizStateService,
    ExplanationTextService,
    UserPreferenceService
  ],
})
export class QuizComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @ViewChild(SharedOptionComponent, { static: false })
  sharedOptionComponent!: SharedOptionComponent;
  @ViewChild('nextButton', { static: false })
  nextButtonTooltip!: MatTooltip;
  @Input() data: {
    questionText: string,
    correctAnswersText?: string,
    currentOptions: Option[]
  };
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() form: FormGroup;
  formControl: FormControl;
  quiz: Quiz;
  quizData: QuizData[];
  quizComponentData: QuizComponentData;
  quizId = '';
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<[QuizQuestion, Option[]]>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion: QuizQuestion | null = null;
  currentQuestion$!: Observable<QuizQuestion | null>;
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  currentQuiz: Quiz;
  routeSubscription: Subscription;
  routerSubscription: Subscription;
  questionAndOptionsSubscription: Subscription;
  optionSelectedSubscription: Subscription;
  subscriptions: Subscription = new Subscription();
  resources: Resource[];
  answers = [];
  answered = false;
  options: Option[] = [];
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  disabled = true;

  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
  selectedAnswerField: number;
  selectionMessage: string;
  selectionMessage$: Observable<string>;
  isAnswered = false;
  correctAnswers: any[] = [];
  nextExplanationText = '';
  correctAnswersText: string;
  cardFooterClass = '';

  showExplanation = false;
  displayExplanation = false;
  explanationText: string | null;

  private combinedQuestionDataSubject = new BehaviorSubject<{
    question: QuizQuestion,
    options: Option[]
  }>(null);
  combinedQuestionData$: Observable<any> = this.combinedQuestionDataSubject.asObservable();

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  questionIndex: number;
  currentQuestionIndex = 0;
  totalQuestions = 0;
  progressPercentage = new BehaviorSubject<number>(0);
  correctCount: number;
  numberOfCorrectAnswers: number;
  score: number;
  elapsedTimeDisplay = 0;
  shouldDisplayCorrectAnswersFlag = false;
  showFeedback = false;

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';

  private isLoading = false;
  private isQuizDataLoaded = false;

  isOptionSelected = false;
  private isCurrentQuestionAnswered = false;

  previousIndex: number | null = null;
  isQuestionIndexChanged = false;
  isNavigating = false;
  private isNavigatedByUrl = false;
  private navigationAbortController: AbortController | null = null;
  private debounceNavigation = false;
  private debounceClick = false;

  private nextButtonTooltipSubject = new BehaviorSubject<string>('Please select an option to continue...');
  nextButtonTooltip$ = this.nextButtonTooltipSubject.asObservable();

  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  isButtonEnabled$: Observable<boolean>;
  isButtonEnabled = false;
  isLoading$: Observable<boolean>;
  isAnswered$: Observable<boolean>;
  isNextButtonEnabled = false;
  isOptionSelected$: Observable<boolean>;
  nextButtonStyle: { [key: string]: string } = {};

  shouldDisplayCorrectAnswers = false;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();
  private destroy$: Subject<void> = new Subject<void>();
  audioAvailable = true;

  private isNextButtonDisabledSubject = new BehaviorSubject<boolean>(true);
  isNextButtonDisabled$ = this.isNextButtonDisabledSubject.asObservable();

  currentQuestionAnswered = false;

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private selectionMessageService: SelectionMessageService,
    private selectedOptionService: SelectedOptionService,
    private resetStateService: ResetStateService,
    private resetBackgroundService: ResetBackgroundService,
    private sharedVisibilityService: SharedVisibilityService,
    private progressBarService: ProgressBarService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone,
    private cdRef: ChangeDetectorRef
  ) {
    this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
      if (isHidden) {
        console.log('Page hidden: Pausing updates.');
        // Page is now hidden, pause or delay any updates here (if needed)
      } else {
        console.log('Page visible: Resuming updates.');
        // Page is now visible, resume updates like updating the question display
  
        this.handleVisibilityChange(); // Call the logic to reload question display
      }
    });

    this.isAnswered$ = this.selectedOptionService.isAnswered$;

    this.quizService.getTotalQuestionsCount().subscribe((total) => {
      this.totalQuestions = total;
    });

    this.subscriptions.add(
      this.quizService.quizReset$.subscribe(() => {
        this.refreshQuestionOnReset();
      })
    );

    this.quizComponentData = {
      data: this.data,
      currentQuestion: this.currentQuestion,
      questions: [],
      question: this.currentQuestion,
      options: this.optionsToDisplay,
      optionsToDisplay: this.optionsToDisplay,
      selectedOption: null,
      currentQuestionIndex: this.currentQuestionIndex,
      multipleAnswer: this.multipleAnswer,
      showFeedback: this.showFeedback,
      selectionMessage: this.selectionMessage
    };

    // Use debounceTime to delay emission of isOptionSelected$ to handle rapid selection
    this.isButtonEnabled$ = this.selectedOptionService.isOptionSelected$().pipe(
      debounceTime(300),
      shareReplay(1)
    );

    // Subscribe to the isNextButtonEnabled$ observable
    this.selectedOptionService.isNextButtonEnabled$.subscribe(
      (enabled) => {
        this.isNextButtonEnabled = enabled;
        console.log('Next button state:', this.isNextButtonEnabled);
      }
    );

    this.selectedOptionService.isOptionSelected$().subscribe(isSelected => {
      this.isCurrentQuestionAnswered = isSelected;
    });    
  }

  @HostListener('window:focus', ['$event'])
  onTabFocus(event: FocusEvent): void {
    this.ngZone.run(() => {
      if (this.isLoading || this.quizStateService.isLoading()) return;

      if (this.currentQuestionIndex !== undefined) {
        this.restoreQuestionDisplay();

        // Re-evaluate the message and UI state
        this.quizQuestionComponent.updateSelectionMessageBasedOnState(); // Sync messages
        this.fetchFormattedExplanationText(this.currentQuestionIndex);
      } else {
        console.warn('Current question index is undefined.');
      }

      // Ensure observables are synced
      this.isLoading$ = this.quizStateService.isLoading$;
      this.isAnswered$ = this.quizStateService.isAnswered$;

      this.cdRef.detectChanges(); // Trigger UI update after state change
    });
  }

  async ngOnInit(): Promise<void> {
    this.activatedRoute.paramMap.subscribe((params) => {
      const quizId = params.get('quizId');
      if (quizId) {
        this.quizId = quizId;
        this.initializeQuizBasedOnRouteParams();
      } else {
        console.error('Quiz ID is not provided in the route');
      }
    });

    this.progressBarService.progress$.subscribe((progressValue) => {
      this.progressPercentage.next(progressValue); // Update the BehaviorSubject
    });    
    this.progressBarService.setProgress(0);

    this.subscribeToOptionSelection();

    this.initializeNextButtonState(); // Initialize button state observables
    this.initializeTooltip(); // Set up tooltip logic
    this.resetOptionState(); // Ensure no lingering selection state
    this.loadQuestionContents(); // Load the first question's contents
    // Reset the answered state initially
    this.selectedOptionService.setAnswered(false);

    // Move resetQuestionState here
    this.resetQuestionState();

    this.subscribeToSelectionMessage();

    // Initialize route parameters and subscribe to updates
    this.initializeRouteParameters();

    // Resolve and fetch quiz data
    this.initializeQuizData();

    // Initialize and shuffle questions
    this.initializeQuestions();

    // Fetch and display the current question
    this.initializeCurrentQuestion();

    this.checkIfAnswerSelected(true);
  }

  private async handleVisibilityChange(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    try {
      const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount());
  
      if (
        typeof currentIndex === 'number' &&
        currentIndex >= 0 &&
        currentIndex < totalQuestions
      ) {
        this.updateQuestionDisplay(currentIndex); // Ensure question state is restored
      } else {
        console.warn('Invalid or out-of-range question index on visibility change.');
      }
    } catch (error) {
      console.error('Error retrieving total questions count:', error);
    }
  }

  async loadQuestionContents(): Promise<void> {
    try {
      this.isLoading = true;
      this.isNextButtonEnabled = false;
      this.updateTooltip('Please select an option to continue...'); // Reset tooltip
  
      const quizId = this.quizService.getCurrentQuizId();
      const questionIndex = this.quizService.getCurrentQuestionIndex();
  
      // Validate the quizId and questionIndex
      if (!quizId) throw new Error('No active quiz ID found.');
      if (typeof questionIndex !== 'number' || questionIndex < 0) {
        throw new Error('Invalid question index.');
      }

      // Clear selection state before loading
      this.resetOptionState();
  
      // Fetch the current question and options as observables
      const question$ = this.quizService.getCurrentQuestionByIndex(quizId, questionIndex);
      const options$ = this.quizService.getCurrentOptions(questionIndex);
  
      // Handle cases where observables are invalid
      if (!question$ || !options$) {
        throw new Error('One or more observables are invalid.');
      }
  
      // Use forkJoin and cast the result type explicitly
      const data = await lastValueFrom(
        forkJoin({
          question: question$,
          options: options$,
          // selectionMessage: this.quizService.getSelectionMessageForCurrentQuestion(),
          // navigationIcons: this.navigationService.getNavigationIcons(),
          // badgeQuestionNumber: this.quizService.getBadgeQuestionNumber(),
          // score: this.scoreService.getCurrentScore(),
        }).pipe(
          catchError((error) => {
            console.error(
              `Error while fetching question or options: ${error.message}`
            );
            return of({ question: null, options: [] }); // Return fallback data if there's an error
          })
        )
      ) as { question: QuizQuestion | null; options: Option[] };
  
      // Validate that the fetched data is correct
      if (!data.question || !Array.isArray(data.options) || data.options.length === 0) {
        console.warn(`Failed to load valid data for questionIndex ${questionIndex}`);
        return;
      }
  
      // Assign the fetched question and options to the component state
      this.currentQuestion = data.question;
      this.options = data.options;
      console.log('Loaded question contents:', data);
  
      // Set the current question in the QuizService
      this.quizService.setCurrentQuestion(questionIndex);
  
      // Update progress after loading the question and options
      this.updateProgressPercentage();
    } catch (error) {
      console.error('Error loading question contents:', error);
    } finally {
      // Ensure loading state is cleared even if there was an error
      this.isLoading = false;
    }
  }

  private async restoreQuestionDisplay(): Promise<void> {  
    if (this.currentQuestionIndex !== undefined && this.questions) {
      // Update the question display
      this.updateQuestionDisplay(this.currentQuestionIndex);
  
      // Ensure selection states are correctly restored
      await this.restoreSelectionState();
  
      // Evaluate and update the Next button state
      await this.evaluateNextButtonState();
    } else {
      console.warn('Cannot restore question display. Question index or questions list is undefined.');
    }
  }

  private async restoreSelectionState(): Promise<void> {
    const selectedOptions = this.selectedOptionService.getSelectedOptionIndices(this.currentQuestionIndex);
  
    // Use for-of loop to re-apply selected states to options
    for (const index of selectedOptions) {
      this.selectedOptionService.addSelectedOptionIndex(this.currentQuestionIndex, index);
    }
  
    console.log(`Restored selected options for question ${this.currentQuestionIndex}:`, selectedOptions);
  }

  private initializeNextButtonState(): void {
    this.isButtonEnabled$ = combineLatest([
      this.selectedOptionService.isAnsweredSubject.pipe(
        startWith(false), // Initialize with 'false'
        debounceTime(500), // Ensuring proper state stabilization
        map((answered) => !!answered),
        distinctUntilChanged()
      ),
      this.quizStateService.isLoading$.pipe(
        startWith(true), // Assume loading initially
        map((loading) => !loading), // Invert to emit when not loading
        distinctUntilChanged()
      ),
      this.quizStateService.isNavigating$.pipe(
        startWith(false), // Assume not navigating initially
        map((navigating) => !navigating), // Invert to emit when not navigating
        distinctUntilChanged()
      )
    ]).pipe(
      map(() => this.evaluateNextButtonState()),
      distinctUntilChanged(), // Emit only if the value changes
      shareReplay(1) // Replay the latest value to new subscribers
    );
  
    // Subscribe to the observable to apply the button state
    this.isButtonEnabled$.subscribe((isEnabled) => {
      console.log('Final state of Next button:', isEnabled);
      this.updateAndSyncNextButtonState(isEnabled);
    });
  }
  
  private evaluateNextButtonState(): boolean {
    this.resetOptionState(); // Reset before checking next button state

    const isAnswered = this.selectedOptionService.isAnsweredSubject.value;
    const isLoading = !this.quizStateService.isLoadingSubject.value;
    const isNavigating = !this.quizStateService.isNavigatingSubject.value;
  
    return isAnswered && isLoading && isNavigating;
  }

  private updateAndSyncNextButtonState(isEnabled: boolean): void {
    this.ngZone.run(() => {
      this.isNextButtonEnabled = isEnabled;
      this.isButtonEnabledSubject.next(isEnabled); // Emit the new state
      this.nextButtonStyle = {
        opacity: isEnabled ? '1' : '0.5',
        'pointer-events': isEnabled ? 'auto' : 'none'
      };
  
      // Trigger change detection to ensure the UI reflects the updated state
      this.cdRef.markForCheck();
    });
  
    // Sync the tooltip observable if needed
    this.nextButtonTooltip$ = this.nextButtonTooltipSubject.asObservable();
  }

  // Tooltip for next button
  private initializeTooltip(): void {
    this.nextButtonTooltip$ = combineLatest([
      this.selectedOptionService.isOptionSelected$().pipe(
        startWith(false),
        distinctUntilChanged()
      ),
      this.isButtonEnabled$.pipe(
        startWith(false),
        distinctUntilChanged()
      )
    ]).pipe(
      map(([isSelected, isEnabled]) => {
        console.log('Combined Tooltip State:', { isSelected, isEnabled });
        return isSelected && isEnabled ? 'Next Question >>' : 'Please select an option to continue...';
      }),
      distinctUntilChanged(),
      tap((tooltipText) => console.log('Tooltip updated to:', tooltipText)),
      catchError((error) => {
        console.error('Tooltip error:', error);
        return of('Please select an option to continue...');
      })
    );

    // Subscribe to the tooltip and trigger a tooltip update.
    this.nextButtonTooltip$.subscribe(() => this.showTooltip());
  }

  private showTooltip(): void {
    if (this.nextButtonTooltip) {
      console.log('Showing tooltip...');
      this.nextButtonTooltip.show(); // Show the tooltip programmatically
      this.cdRef.detectChanges(); // Ensure Angular picks up the change
    } else {
      console.warn('Tooltip not available');
    }
  }

  private refreshTooltip(): void {
    if (this.nextButtonTooltip) {
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => this.nextButtonTooltip.show(), 0);
      });
    }
  }

  private enableNextButtonWithTooltip(message: string): void {
    this.isNextButtonEnabled = true;
    this.updateTooltip(message); // Ensure tooltip updates immediately
  }
  
  private disableNextButtonWithTooltip(message: string): void {
    this.isNextButtonEnabled = false;
    this.updateTooltip(message); // Update tooltip to reflect the disabled state
  }
  
  private updateTooltip(message: string): void {
    setTimeout(() => {
      if (this.nextButtonTooltip) {
        console.log('Updating tooltip:', message);
        this.nextButtonTooltip.message = message;
        this.nextButtonTooltip.show(); // Manually show the tooltip
      } else {
        console.warn('Tooltip reference not available in QQC');
      }
    }, 0);
  }

  private subscribeToOptionSelection(): void {
    this.optionSelectedSubscription = this.selectedOptionService
      .isOptionSelected$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((isSelected: boolean) => {
        this.isOptionSelected = isSelected;
        this.isNextButtonEnabled = isSelected;
        this.cdRef.detectChanges();
      });
  }

  logEvent(event: any) {
    console.log('logEvent called with:', event);
  }

  onOptionSelected(
    event: { option: SelectedOption; index: number; checked: boolean },
    isUserAction: boolean = true
  ): void {
    if (!isUserAction) {
      console.log('Skipping processing as this is not a user action');
      return;
    }

    const { option, checked } = event;
    if (this.currentQuestion.type === QuestionType.SingleAnswer) {
      this.selectedOptions = checked ? [option] : [];
    } else {
      this.updateMultipleAnswerSelection(option, checked);
    }

    const isOptionSelected = this.isAnyOptionSelected();
    this.selectedOptionService.setOptionSelected(isOptionSelected);
    this.quizStateService.setAnswerSelected(isOptionSelected);

    console.log('After option selection:', {
      selectedOptions: this.selectedOptions,
      isNextButtonEnabled: isOptionSelected,
    });

    this.ngZone.run(() => {
      setTimeout(() => {
        this.updateAndSyncNextButtonState(checked);
        this.cdRef.detectChanges();
      }, 300);
    });    

    this.cdRef.detectChanges();
    this.refreshTooltip();
  }

  
  private updateMultipleAnswerSelection(option: SelectedOption, checked: boolean): void {
    if (checked) {
      this.selectedOptions.push(option);
    } else {
      this.selectedOptions = this.selectedOptions.filter(o => o.optionId !== option.optionId);
    }
  }  

  private isAnyOptionSelected(): boolean {
    const result = this.selectedOptions.length > 0;
    console.log(
      `isAnyOptionSelected: ${result}, selectedOptions:`,
      this.selectedOptions
    );
    return result;
  }
  
  private resetQuestionState(): void {
    console.log('Resetting question state');
    this.selectedOptions = [];
    this.currentQuestionAnswered = false;
    this.isNextButtonEnabled = false;
    this.isButtonEnabled = false;
    this.isButtonEnabledSubject.next(false);

    if (this.currentQuestion && this.currentQuestion.options) {
      for (const option of this.currentQuestion.options) {
        if (option.selected) {
          console.log(`Clearing selected state for option: ${option.optionId}`);
          option.selected = false;
        }
      }
    }

    this.quizStateService.setAnswered(false);
    this.quizStateService.setLoading(false);

    console.log('Question state reset:', {
      selectedOptions: this.selectedOptions,
      isNextButtonEnabled: this.isNextButtonEnabled,
      currentQuestionAnswered: this.currentQuestionAnswered,
      isButtonEnabled: this.isButtonEnabled,
    });

    this.cdRef.detectChanges();
  }

  private resetOptionState(): void {
    this.isOptionSelected = false;
    this.selectedOptionService.setOptionSelected(false);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    this.subscriptions.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.questionAndOptionsSubscription?.unsubscribe();
    this.optionSelectedSubscription?.unsubscribe();
    this.timerService.stopTimer(null);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentQuestionIndex']) {
      this.loadCurrentQuestion();
    }

    if (changes['question'] && changes['question'].currentValue) {
      console.log('Question updated:', changes['question'].currentValue);
    } else {
      console.error('Question is not defined or updated properly.');
    }
  }

  // potentially remove...
  onExplanationToDisplayChange(explanation: string): void {
    this.explanationToDisplay = explanation;
  }

  // Public getter methods for determining UI state based on current quiz and question data.
  public get isContentAvailable(): boolean {
    return !!this.currentQuestion && this.options.length > 0;
  }  

  public get shouldDisplayContent(): boolean {
    return !!this.data?.questionText && !!this.questionToDisplay;
  }

  public get shouldApplyLastQuestionClass(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  public get shouldHidePrevQuestionNav(): boolean {
    return this.currentQuestionIndex === 0;
  }

  public get shouldHideNextButton(): boolean {
    // Hide if data isn't loaded or on the last question
    return (
      !this.isQuizDataLoaded ||
      this.currentQuestionIndex >= this.totalQuestions - 1
    );
  }

  public get shouldHideShowResultsButton(): boolean {
    // Hide if data isn't loaded or not on the last question
    return (
      !this.isQuizDataLoaded ||
      this.currentQuestionIndex < this.totalQuestions - 1
    );
  }

  public get shouldHideRestartNav(): boolean {
    return (
      this.currentQuestionIndex === 0 ||
      (this.selectedQuiz?.questions &&
        this.currentQuestionIndex === this.selectedQuiz.questions.length - 1)
    );
  }

  /*************** Shuffle and initialize questions ******************/
  private initializeQuestions(): void {
    this.questions = this.quizService.getShuffledQuestions();
    console.log(
      'Shuffled questions received in component:',
      this.questions.map((q) => q.questionText)
    );
  }

  /*************** ngOnInit barrel functions ******************/
  private initializeRouteParameters(): void {
    this.fetchRouteParams();
    this.subscribeRouterAndInit();
    this.subscribeToRouteParams();
    this.initializeRouteParams();
  }

  private initializeQuizData(): void {
    this.resolveQuizData();
    this.fetchQuizData();
    this.initializeQuiz();
    this.initializeQuizFromRoute();
  }

  private initializeCurrentQuestion(): void {
    this.initializeQuestionStreams();
    this.loadQuizQuestionsForCurrentQuiz();
    this.createQuestionData();
    this.getQuestion();

    this.correctAnswersTextSource.subscribe((text) => {
      this.correctAnswersText = text;
    }); // todo: check if needed

    this.subscribeToCurrentQuestion();
  }

  /***************** Initialize route parameters and subscribe to updates ****************/
  fetchRouteParams(): void {
    this.activatedRoute.params
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        this.quizId = params['quizId'];
        this.questionIndex = +params['questionIndex'];
        this.currentQuestionIndex = this.questionIndex - 1; // Ensure it's zero-based
        this.loadQuizData();
      });
  }

  async loadQuizData(): Promise<void> {
    try {
      const quiz = (await firstValueFrom(
        this.quizDataService.getQuiz(this.quizId).pipe(takeUntil(this.destroy$))
      )) as Quiz;
      if (quiz) {
        this.quiz = quiz;
        if (quiz.questions && quiz.questions.length > 0) {
          this.currentQuestion = quiz.questions[this.questionIndex - 1];
        } else {
          console.error('Quiz has no questions.');
        }
      } else {
        console.error('Quiz data is unavailable.');
      }
    } catch (error) {
      console.error('Error loading quiz data:', error);
    }
  }

  private subscribeRouterAndInit(): void {
    this.routerSubscription = this.activatedRoute.data.subscribe((data) => {
      const quizData: Quiz = data.quizData;
      if (
        !quizData ||
        !Array.isArray(quizData.questions) ||
        quizData.questions.length === 0
      ) {
        console.error('Quiz data is undefined, or there are no questions');
        this.router.navigate(['/select']).then(() => {
          console.log('No quiz data available.');
        });
        return;
      }

      this.currentQuiz = quizData;
      this.quizId = quizData.quizId;
      this.questionIndex =
        +this.activatedRoute.snapshot.params['questionIndex'];
    });
  }

  /******* initialize route parameters functions *********/
  private subscribeToRouteParams(): void {
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];
      this.currentQuestionIndex = +params['questionIndex'] - 1;
      this.loadAndSetupQuestion(this.currentQuestionIndex, true);
    });
  }

  initializeRouteParams(): void {
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];

      // Correctly handle the case where 'questionIndex' might be 0 or undefined
      const routeQuestionIndex =
        params['questionIndex'] !== undefined ? +params['questionIndex'] : 1;

      // Adjust for zero-based indexing
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);

      if (adjustedIndex === 0) {
        // Call the special initialization function for the first question
        this.initializeFirstQuestion();
      } else {
        // Handle all other questions through a general update display function
        this.updateQuestionDisplay(adjustedIndex);
      }
    });
  }

  /**** Initialize route parameters and subscribe to updates ****/
  resolveQuizData(): void {
    this.activatedRoute.data
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((data: { quizData: Quiz }) => {
        // console.log('Resolved quiz data:', data.quizData);

        if (
          data.quizData &&
          Array.isArray(data.quizData.questions) &&
          data.quizData.questions.length > 0
        ) {
          this.selectedQuiz = data.quizData;

          this.quizService.setSelectedQuiz(data.quizData);
          this.explanationTextService.initializeExplanationTexts(
            data.quizData.questions.map((question) => question.explanation)
          );

          this.initializeQuiz(); // Ensure this method sets currentQuestionIndex correctly
        } else {
          console.error('Quiz data is undefined, or there are no questions');
          this.router.navigate(['/select']).then(() => {
            console.log('No quiz data available.');
          });
        }
      });
  }

  async fetchQuizData(): Promise<void> {
    try {
      const quizId = this.activatedRoute.snapshot.params['quizId'];
      const questionIndexParam =
        this.activatedRoute.snapshot.params['questionIndex'];
      const questionIndex = parseInt(questionIndexParam, 10);

      if (isNaN(questionIndex)) {
        console.error('Invalid question index:', questionIndexParam);
        return;
      }

      const zeroBasedQuestionIndex = questionIndex - 1;

      const selectedQuiz: Quiz = await firstValueFrom(
        this.quizDataService.getQuiz(quizId).pipe(takeUntil(this.destroy$))
      );
      if (!selectedQuiz) {
        console.error('Selected quiz not found for quizId:', quizId);
        return;
      }
      this.selectedQuiz = selectedQuiz;

      if (
        zeroBasedQuestionIndex < 0 ||
        zeroBasedQuestionIndex >= selectedQuiz.questions.length
      ) {
        console.error('Invalid question index:', zeroBasedQuestionIndex);
        return;
      }

      // Ensure the current question is set
      const currentQuestion = selectedQuiz.questions[zeroBasedQuestionIndex];
      if (!currentQuestion) {
        console.error(
          `Question not found at index ${zeroBasedQuestionIndex} for quizId ${quizId}`
        );
        return;
      }
      this.currentQuestion = currentQuestion;

      this.processQuizData(zeroBasedQuestionIndex, this.selectedQuiz);
      this.quizService.initializeSelectedQuizData(this.selectedQuiz);

      const questionData = await this.fetchQuestionData(
        quizId,
        zeroBasedQuestionIndex
      );
      if (!questionData) {
        console.error('Question data could not be fetched.');
        this.data = null;
        return;
      }

      this.initializeAndPrepareQuestion(questionData, quizId);
      this.quizService.setCurrentQuestion(zeroBasedQuestionIndex);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private initializeQuiz(): void {
    this.prepareQuizSession();
    this.initializeQuizDependencies();
    this.initializeQuizBasedOnRouteParams();
  }

  private async prepareQuizSession(): Promise<void> {
    try {
      this.currentQuestionIndex = 0;
      this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');

      // Fetch questions for the quiz and await the result
      const questions = await firstValueFrom(
        this.quizDataService.getQuestionsForQuiz(this.quizId)
      );
      this.questions = questions; // Store the fetched questions in a component property

      const question = questions[this.currentQuestionIndex];

      // Check for stored states after ensuring we have the questions
      const storedStates = this.quizStateService.getStoredState(this.quizId);

      if (storedStates) {
        // Logic to restore stored states to each question
        for (const [questionId, state] of storedStates.entries()) {
          this.quizStateService.setQuestionState(
            this.quizId,
            questionId,
            state
          );

          if (state.isAnswered && state.explanationDisplayed) {
            const explanationTextObservable =
              this.explanationTextService.getFormattedExplanation(+questionId);
            const explanationText = await firstValueFrom(
              explanationTextObservable
            );

            this.explanationTextService.storeFormattedExplanation(
              +questionId,
              explanationText,
              question
            );
          }
        }

        // Check and set explanation display for the first question if needed
        const firstQuestionState = storedStates.get(0);
        if (firstQuestionState && firstQuestionState.isAnswered) {
          this.explanationTextService.setShouldDisplayExplanation(true);
        }
      } else {
        // Apply default states to all questions as no stored state is found
        this.quizStateService.applyDefaultStates(this.quizId, questions);
      }
    } catch (error) {
      console.error('Error in prepareQuizSession:', error);
    }
  }

  private initializeQuizDependencies(): void {
    this.initializeSelectedQuiz();
    this.initializeObservables();
    this.fetchQuestionAndOptions();
  }

  private initializeSelectedQuiz(): void {
    this.quizDataService.getQuiz(this.quizId).subscribe({
      next: (quiz: Quiz) => {
        if (!quiz) {
          console.error('Quiz data is null or undefined');
          return;
        }
        this.selectedQuiz = quiz;
        if (
          !this.selectedQuiz.questions ||
          this.selectedQuiz.questions.length === 0
        ) {
          console.error('Quiz has no questions');
          return;
        }
        const currentQuestionOptions =
          this.selectedQuiz.questions[this.currentQuestionIndex].options;
        this.numberOfCorrectAnswers =
          this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
            currentQuestionOptions
          );
      },
      error: (error: any) => {
        console.error(error);
      },
    });
  }

  private initializeObservables(): void {
    const quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.quizDataService.setSelectedQuizById(quizId);
    this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
      this.selectedQuiz = quiz;
    });
  }

  private fetchQuestionAndOptions(): void {
    if (document.hidden) {
      console.log('Document is hidden, not loading question');
      return;
    }

    if (!this.quizId || this.quizId.trim() === '') {
      console.error('Quiz ID is required but not provided.');
      return;
    }

    this.quizDataService
      .getQuestionAndOptions(this.quizId, this.questionIndex)
      .pipe(
        map((data) => (Array.isArray(data) ? data : [null, null])),
        map(([question, options]) => [question || null, options || null]),
        catchError((error) => {
          console.error('Error fetching question and options:', error);
          return of([null, null]);
        })
      )
      .subscribe(([question, options]) => {
        if (question && options) {
          this.quizStateService.updateCurrentQuizState(of(question));
        } else {
          console.log('Question or options not found');
        }
      });
  }

  /****** Start of functions responsible for handling navigation to a particular question using the URL. ******/
  setupNavigation(): void {
    this.activatedRoute.params
      .pipe(
        takeUntil(this.destroy$),
        map((params) => +params['questionIndex']),
        distinctUntilChanged(),
        tap((currentIndex) => {
          this.isNavigatedByUrl = true;
          this.updateContentBasedOnIndex(currentIndex);
        })
      )
      .subscribe();
  }

  ensureExplanationsLoaded(): Observable<boolean> {
    // Check if explanations are already loaded
    if (
      Object.keys(this.explanationTextService.formattedExplanations).length > 0
    ) {
      console.log('Explanations are already loaded.');
      return of(true);
    } else {
      console.log('Starting to preload explanations...');
      // Map each question to its formatted explanation text Observable
      const explanationObservables = this.quiz.questions.map(
        (question, index) =>
          this.explanationTextService.formatExplanationText(question, index)
      );

      // Use forkJoin to execute all Observables and wait for their completion
      return forkJoin(explanationObservables).pipe(
        tap((explanations) => {
          // Update the formattedExplanations with the new data
          for (const explanation of explanations) {
            this.explanationTextService.formattedExplanations[
              explanation.questionIndex
            ] = {
              questionIndex: explanation.questionIndex,
              explanation: explanation.explanation,
            };
            console.log(
              `Preloaded explanation for index ${explanation.questionIndex}:`,
              explanation.explanation
            );
          }
          console.log(
            'All explanations preloaded:',
            this.explanationTextService.formattedExplanations
          );
        }),
        map(() => true), // Ensure this Observable resolves to true
        catchError((err) => {
          console.error('Error preloading explanations:', err);
          return of(false);
        })
      );
    }
  }

  // This function updates the content based on the provided index.
  // It validates the index, checks if navigation is needed, and loads the appropriate question.
  updateContentBasedOnIndex(index: number): void {
    const adjustedIndex = index - 1;

    // Check if the adjusted index is out of bounds
    if (adjustedIndex < 0 || adjustedIndex >= this.quiz.questions.length) {
      console.error('Invalid index:', adjustedIndex);
      return;
    }

    // Check if the index has changed or if navigation is triggered by the URL
    if (this.previousIndex !== adjustedIndex || this.isNavigatedByUrl) {
      this.previousIndex = adjustedIndex;
      this.resetExplanationText();
      this.loadQuestionByRouteIndex(adjustedIndex);
      this.isNavigatedByUrl = false;
    } else {
      console.log('No index change detected, still on index:', adjustedIndex);
    }
  }

  resetExplanationText(): void {
    this.explanationToDisplay = '';
  }

  // This function loads the question corresponding to the provided index.
  // It sets the current question and options to display based on the index.
  loadQuestionByRouteIndex(index: number): void {
    if (!this.quiz || index < 0 || index >= this.quiz.questions.length) {
      console.error('Question index out of bounds:', index);
      return;
    }

    const question = this.quiz.questions[index];
    this.questionToDisplay = question.questionText;
    this.optionsToDisplay = question.options;
    this.shouldDisplayCorrectAnswers = question.options.some(
      (opt) => opt.correct
    );

    this.fetchFormattedExplanationText(index);
  }

  fetchFormattedExplanationText(index: number): void {
    this.resetExplanationText(); // Reset explanation text before fetching

    if (index in this.explanationTextService.formattedExplanations) {
      const explanationObj =
        this.explanationTextService.formattedExplanations[index];
      this.explanationToDisplay = explanationObj?.explanation ?? 'No explanation available for this question.';
    } else {
      this.explanationToDisplay = 'No explanation available for this question.';
      console.error('Missing formatted explanation for index:', index);
    }
  }
  /****** End of functions responsible for handling navigation to a particular question using the URL. ******/

  shouldShowExplanation(index: number): boolean {
    return !!this.explanationToDisplay;
  }

  updateQuestionDisplayForShuffledQuestions(): void {
    this.questionToDisplay =
      this.questions[this.currentQuestionIndex].questionText;
  }

  getQuestionAndOptions(quizId: string, questionIndex: number): void {
    // Fetch the question and options using the QuizDataService
    this.questionAndOptionsSubscription = this.quizDataService
      .getQuestionAndOptions(quizId, questionIndex)
      .subscribe({
        next: ([question, options]) => {
          // Update component state or variables to reflect the new question and options
          this.question = question;
          this.options = options;
        },
        error: (error) => {
          console.error('Error fetching question and options:', error);
        },
      });
  }

  updateQuestionAndOptions(): void {
    if (this.questionIndex == null || isNaN(this.questionIndex)) {
      console.error(
        'Question index is undefined or invalid:',
        this.questionIndex
      );
      return;
    }

    this.quizDataService
      .fetchQuizQuestionByIdAndIndex(this.quizId, this.questionIndex)
      .subscribe({
        next: (question) => {
          if (question && question.options) {
            this.question = question;
            this.options = question.options;
          } else {
            console.error(
              'No valid question or options found for index:',
              this.questionIndex
            );
          }
        },
        error: (error) => {
          console.error('Error fetching question from service:', error);
        },
      });
  }

  refreshQuestionOnReset(): void {
    this.quizService.setCurrentQuestion(0);
    this.loadCurrentQuestion();
  }

  checkAndDisplayCorrectAnswers(): void {
    const multipleAnswerQuestionIndex =
      this.quizService.findCurrentMultipleAnswerQuestionIndex();
    if (this.quizService.isAnswered(multipleAnswerQuestionIndex)) {
      this.shouldDisplayNumberOfCorrectAnswers = true;
    }
  }

  private async fetchQuestionData(
    quizId: string,
    questionIndex: number
  ): Promise<any> {
    try {
      const rawData = await firstValueFrom(
        of(this.quizService.getQuestionData(quizId, questionIndex))
      );

      // Get the explanation as an Observable
      const explanationObservable =
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        );

      // Convert the Observable to a Promise and await its value
      const explanation = await firstValueFrom(explanationObservable);

      const transformedData: QuizQuestion = {
        questionText: rawData.questionText ?? '',
        options: [],
        explanation: explanation ?? '',
        type: this.quizDataService.questionType as QuestionType,
      };
      return transformedData;
    } catch (error) {
      console.error('Error fetching question data:', error);
      throw error;
    }
  }

  private initializeAndPrepareQuestion(
    questionData: CombinedQuestionDataType,
    quizId: string
  ): void {
    if (!quizId) {
      console.error('Quiz ID is not provided or is empty');
      return;
    }

    const data = {
      ...questionData,
      currentOptions: questionData.currentOptions || [],
    };
    this.data = data;
    this.quizService.setQuizId(quizId);
    this.quizService
      .fetchQuizQuestions(quizId)
      .then((questions) => {
        this.quizService.setQuestionData(questions);
      })
      .catch((error) => {
        console.error('Error fetching questions:', error);
      });

    // Subscribe to the observable to get the actual data
    this.quizStateService.currentOptions$.subscribe((options: Option[]) => {
      // Construct currentQuestion inside the subscription
      const currentQuestion: QuizQuestion = {
        questionText: this.data.questionText,
        options: options,
        explanation:
          this.explanationTextService.formattedExplanationSubject.getValue(),
        type: this.quizDataService.questionType as QuestionType,
      };
      this.question = currentQuestion;

      const correctAnswerOptions = currentQuestion.options.filter(
        (option: Option) => option.correct
      );
      this.quizService.setCorrectAnswers(currentQuestion, correctAnswerOptions).subscribe({
        next: () => {
          this.prepareFeedback();
        },
        error: (err) => {
          console.error('Error setting correct answers:', err);
        }
      });
      this.quizService.setCorrectAnswersLoaded(true);
      this.quizService.correctAnswersLoadedSubject.next(true);

      console.log('Correct Answer Options:', correctAnswerOptions);
    });
  }

  private prepareFeedback(): void {
    this.showFeedback = true;
    this.cdRef.detectChanges(); // Ensure change detection
    console.log('Feedback prepared and displayed.');
  }

  private initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) => {
          const questionIndex = +params.get('questionIndex');
          if (isNaN(questionIndex) || questionIndex < 0) {
            console.error(
              'Question index is not a valid number or is negative:',
              questionIndex
            );
            return EMPTY;
          }
          return this.handleRouteParams(params).pipe(
            catchError((error: Error) => {
              console.error('Error in handling route parameters:', error);
              return EMPTY;
            })
          );
        }),
        switchMap((data) => {
          const { quizData, questionIndex } = data;

          if (
            !quizData ||
            typeof quizData !== 'object' ||
            !quizData.questions ||
            !Array.isArray(quizData.questions)
          ) {
            console.error(
              'Quiz data is missing, not an object, or the questions array is invalid:',
              quizData
            );
            return EMPTY;
          }

          // Adjust the last question index to be the maximum index of the questions array
          const lastIndex = quizData.questions.length - 1;
          const adjustedIndex = Math.min(questionIndex, lastIndex);

          // Handle the case where the adjusted index is negative
          if (adjustedIndex < 0) {
            console.error(
              'Adjusted question index is negative:',
              adjustedIndex
            );
            return EMPTY;
          }

          // Set the active quiz and retrieve the question by index
          this.quizService.setActiveQuiz(quizData);
          this.initializeQuizState();
          return this.quizService.getQuestionByIndex(adjustedIndex);
        }),
        catchError((error: Error) => {
          console.error('Observable chain failed:', error);
          return EMPTY;
        })
      )
      .subscribe({
        next: (question: QuizQuestion | null) => {
          if (question) {
            this.currentQuiz = this.quizService.getActiveQuiz();
            this.currentQuestion = question;
          } else {
            console.error('No question data available after fetch.');
          }
        },
        error: (error) => console.error('Error during subscription:', error),
        complete: () =>
          console.log(
            'Route parameters processed and question loaded successfully.'
          ),
      });
  }

  initializeQuizFromRoute(): void {
    this.activatedRoute.data.subscribe((data) => {
      if (data.quizData) {
        this.quiz = data.quizData;

        this.ensureExplanationsLoaded().subscribe(() => {
          console.log('Explanations preloaded successfully.');
          this.setupNavigation();
        });
      } else {
        console.error('Quiz data is unavailable.');
      }
    });
  }

  /************* Fetch and display the current question ***************/
  initializeQuestionStreams(): void {
    // Initialize questions stream
    this.questions$ = this.quizDataService.getQuestionsForQuiz(this.quizId);

    this.questions$.subscribe((questions) => {
      if (questions) {
        this.currentQuestionIndex = 0;

        // Reset and set initial state for each question
        for (const [index, question] of questions.entries()) {
          const defaultState: QuestionState =
            this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(
            this.quizId,
            index,
            defaultState
          );
        }
      }
    });

    const nextQuestion$ = this.quizService.getNextQuestion(
      this.currentQuestionIndex
    );
    const nextOptions$ = this.quizService.getNextOptions(
      this.currentQuestionIndex
    );
  }

  // Function to load all questions for the current quiz
  private loadQuizQuestionsForCurrentQuiz(): void {
    this.isQuizDataLoaded = false;
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.questions = questions;
        this.isQuizDataLoaded = true;
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
        this.isQuizDataLoaded = true;
      },
    });
  }

  createQuestionData(): void {
    const createQuestionData = (
      question: QuizQuestion | null,
      options: Option[] | null
    ) => ({
      questionText: question?.questionText ?? null,
      correctAnswersText: null,
      options: options ?? [] // Fallback to an empty array if options are null or undefined
    });

    // Combine nextQuestion$ and nextOptions$ using combineLatest
    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$.pipe(
        map(value => {
          if (value === undefined) {
            console.warn('nextQuestion$ emitted undefined, defaulting to null');
            return null;
          }
          return value;
        }),
        distinctUntilChanged()
      ),
      this.quizService.nextOptions$.pipe(
        map(value => {
          if (value === undefined) {
            console.warn('nextOptions$ emitted undefined, defaulting to empty array');
            return [];
          }
          return value;
        }),
        distinctUntilChanged()
      )
    ]).pipe(
      switchMap(([nextQuestion, nextOptions]) => {
        if (nextQuestion) {
          return of(createQuestionData(nextQuestion, nextOptions));
        } else {
          return combineLatest([
            this.quizService.previousQuestion$.pipe(
              map(value => {
                if (value === undefined) {
                  console.warn('previousQuestion$ emitted undefined, defaulting to null');
                  return null;
                }
                return value;
              }),
              distinctUntilChanged()
            ),
            this.quizService.previousOptions$.pipe(
              map(value => {
                if (value === undefined) {
                  console.warn('previousOptions$ emitted undefined, defaulting to empty array');
                  return [];
                }
                return value;
              }),
              distinctUntilChanged()
            )
          ]).pipe(
            map(([previousQuestion, previousOptions]) =>
              createQuestionData(previousQuestion, previousOptions)
            )
          );
        }
      }),
      catchError(error => {
        console.error('Error in createQuestionData:', error);
        return of(createQuestionData(null, [])); // Fallback if an error occurs
      })
    );
  }

  private async getQuestion(): Promise<void | null> {
    try {
      const quizId = this.activatedRoute.snapshot.params.quizId;
      const currentQuestionIndex = this.currentQuestionIndex;

      if (!quizId || quizId.trim() === '') {
        console.error('Quiz ID is required but not provided.');
        return null;
      }

      // Fetch the question and options
      const result = await firstValueFrom(
        of(
          this.quizDataService.fetchQuestionAndOptionsFromAPI(
            quizId,
            currentQuestionIndex
          )
        )
      );

      if (!result) {
        console.error('No valid question found');
        return null;
      }

      const [question, options] = result ?? [null, null];
      this.handleQuestion(question);
      this.handleOptions(options);
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
  }

  private async isQuestionAnswered(questionIndex: number): Promise<boolean> {
    try {
      return await firstValueFrom(this.quizService.isAnswered(questionIndex));
    } catch (error) {
      console.error('Failed to determine if question is answered:', error);
      return false;
    }
  }

  private loadAndSetupQuestion(index: number, resetMessage: boolean): void {
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: async (questions: QuizQuestion[]) => {
        if (questions && questions[index]) {
          this.currentQuestion = questions[index];

          // Always reset isAnswered to false when a new question loads
          this.isAnswered = false;

          // If resetMessage is true, set the initial message
          if (resetMessage) {
            const initialMessage = 'Please select an option to continue...';
            this.selectionMessageService.updateSelectionMessage(initialMessage);
          }

          // Check if the current question is answered
          this.isQuestionAnswered(index);
        } else {
          console.error('Question not found for index:', index);
        }
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
      },
    });
  }

  onSelectionMessageChange(message: string) {
    this.selectionMessage = message;
  }

  onIsAnsweredChange(isAnswered: boolean) {
    this.isAnswered = isAnswered;
  }

  // Function to subscribe to changes in the current question and update the currentQuestionType
  private subscribeToCurrentQuestion(): void {
    const combinedQuestionObservable = merge(
      this.quizService.getCurrentQuestionObservable().pipe(
        retry(2),
        catchError((error: Error) => {
          console.error(
            'Error subscribing to current question from quizService:',
            error
          );
          return of(null); // Emit null to continue the stream
        })
      ),
      this.quizStateService.currentQuestion$
    );
  
    combinedQuestionObservable
      .pipe(
        filter((question): question is QuizQuestion => question !== null) // Type guard to filter non-null values
      )
      .subscribe({
        next: (question: QuizQuestion) => this.handleNewQuestion(question),
        error: (error) => {
          console.error('Error processing the question streams:', error);
          this.resetCurrentQuestionState();
        },
      });
  }
  
  private async handleNewQuestion(question: QuizQuestion): Promise<void> {
    try {
      this.currentQuestion = question;
      this.options = question.options || []; // Initialize options safely
      this.currentQuestionType = question.type;
  
      // Handle correct answers text update
      await this.updateCorrectAnswersText(question, this.options);
  
      // Reset the timer for the new question
      this.timerService.resetTimer();
    } catch (error) {
      console.error('Error handling new question:', error);
    }
  }

  // Helper method to reset the current question state
  private resetCurrentQuestionState(): void {
    this.currentQuestion = null;
    this.options = [];
    this.currentQuestionType = null; // Reset on error
    this.correctAnswersTextSource.next(''); // Clear the correct answers text
    console.warn('Resetting the current question state.');
  }

  private async updateCorrectAnswersText(
    question: QuizQuestion,
    options: Option[]
  ): Promise<void> {
    try {
      const [multipleAnswers, isExplanationDisplayed] = await Promise.all([
        firstValueFrom(this.quizStateService.isMultipleAnswerQuestion(question)),
        this.explanationTextService.isExplanationTextDisplayedSource.getValue(),
      ]);
  
      const correctAnswersText = 
        multipleAnswers && !isExplanationDisplayed
          ? this.getCorrectAnswersText(options)
          : '';
  
      // Emit the correct answers text to subscribers
      this.correctAnswersTextSource.next(correctAnswersText);
    } catch (error) {
      console.error('Error updating correct answers text:', error);
      this.correctAnswersTextSource.next(''); // Clear text on error
    }
  }
  
  private getCorrectAnswersText(options: Option[]): string {
    const numCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(options);
    return this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numCorrectAnswers);
  }

  private subscribeToSelectionMessage(): void {
    this.selectionMessageService.selectionMessage$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(), // Added distinctUntilChanged to prevent redundant updates
        takeUntil(this.destroy$)
      )
      .subscribe((message: string) => {
        if (this.selectionMessage !== message) {
          this.selectionMessage = message;
        }
      });
  }

  isLastQuestion(): boolean {
    return this.currentQuestionIndex === this.totalQuestions - 1;
  }

  private processQuizData(questionIndex: number, selectedQuiz: Quiz): void {
    if (
      !selectedQuiz ||
      !Array.isArray(selectedQuiz.questions) ||
      selectedQuiz.questions.length === 0
    ) {
      console.error(
        `Quiz data is invalid or not loaded for Quiz ID ${this.quizId}`
      );
      return;
    }

    if (
      !this.quizService.isValidQuestionIndex(
        questionIndex,
        selectedQuiz.questions
      )
    ) {
      console.error(
        `Invalid question index: ${questionIndex} for Quiz ID ${this.quizId}`
      );
      return;
    }

    const currentQuestion = selectedQuiz.questions[questionIndex];

    // Initialize the quiz state for the current question
    this.quizStateService.createDefaultQuestionState();

    // Reset the selection message to prompt user to select an option
    this.selectionMessageService.selectionMessageSubject.next(
      'Please select an option to continue...'
    );
  }

  private initializeQuizState(): void {
    // Call findQuizByQuizId and subscribe to the observable to get the quiz data
    this.quizService.findQuizByQuizId(this.quizId).subscribe({
      next: (currentQuiz) => {
        if (!currentQuiz) {
          console.error(`Quiz not found: Quiz ID ${this.quizId}`);
          return;
        }

        // Check if the questions property exists, is an array, and is not empty
        if (
          !Array.isArray(currentQuiz.questions) ||
          currentQuiz.questions.length === 0
        ) {
          console.error(
            `Questions data is invalid or not loaded for Quiz ID ${this.quizId}`
          );
          return;
        }

        // Ensure the currentQuestionIndex is valid for the currentQuiz's questions array
        if (
          !this.quizService.isValidQuestionIndex(
            this.currentQuestionIndex,
            currentQuiz.questions
          )
        ) {
          console.error(
            `Invalid question index: Quiz ID ${this.quizId}, Question Index (0-based) ${this.currentQuestionIndex}`
          );
          return;
        }

        // Retrieve the current question using the valid index
        const currentQuestion = currentQuiz.questions[this.currentQuestionIndex];

        // Check if the currentQuestion is defined before proceeding
        if (!currentQuestion) {
          console.error(
            `Current question is undefined: Quiz ID ${this.quizId}, Question Index ${this.currentQuestionIndex}`
          );
          return;
        }

        // Proceed to update the UI for the new question if all checks pass
        this.updateQuizUIForNewQuestion(currentQuestion);
      },
      error: (error) => {
        console.error(`Error retrieving quiz: ${error.message}`);
      },
    });
  }

  private updateQuizUIForNewQuestion(
    question: QuizQuestion = this.currentQuestion
  ): void {
    if (!question) {
      console.error('Invalid question:', question);
      return;
    }

    // Find the index of the current question
    const questionIndex = this.quizService.findQuestionIndex(
      this.currentQuestion
    );
    if (
      questionIndex < 0 ||
      questionIndex >= (this.selectedQuiz?.questions.length || 0)
    ) {
      console.error('Invalid question index:', questionIndex);
      return;
    }
    this.quizService.setCurrentQuestion(questionIndex);

    // Reset UI elements and messages as needed
    this.selectionMessageService.updateSelectionMessage('');
    this.selectedOption$.next(null);
    this.explanationTextService.explanationText$.next('');
  }

  updateQuestionDisplay(questionIndex: number): void {
    if (!Array.isArray(this.questions) || this.questions.length === 0) {
      console.warn('Questions array is not initialized or empty...');
      return;
    }
  
    if (questionIndex >= 0 && questionIndex < this.questions.length) {
      const selectedQuestion = this.questions[questionIndex];
      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;
    } else {
      console.warn(`Invalid question index: ${questionIndex}.`);
    }
  }

  private async updateQuestionStateAndExplanation(
    questionIndex: number
  ): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(
      this.quizId,
      questionIndex
    );

    if (!questionState.selectedOptions) {
      questionState.selectedOptions = [];
    }

    if (questionState.isAnswered) {
      // Convert the Observable to a Promise and await its value
      this.explanationToDisplay = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(
          questionIndex
        )
      );

      this.explanationTextService.setExplanationText(this.explanationToDisplay);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.showExplanation = true;
    } else {
      this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.showExplanation = false;
    }

    console.log(
      `Explanation for question ${questionIndex}:`,
      this.explanationToDisplay
    );
  }

  initializeFirstQuestion(): void {
    this.resetQuestionDisplayState();

    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: async (questions: QuizQuestion[]) => {
        if (questions && questions.length > 0) {
          this.questions = questions;
          this.currentQuestion = questions[0];
          this.currentQuestionIndex = 0;
          this.questionToDisplay = this.currentQuestion.questionText;
          this.optionsToDisplay = this.currentQuestion.options;
          this.shouldDisplayCorrectAnswersFlag = false;

          // Initialize or update the state for all questions
          for (let index = 0; index < questions.length; index++) {
            await this.updateQuestionStateAndExplanation(index);
          }

          // Check if the first question is answered and update the message
          await this.checkIfAnswerSelected(true); // Pass true to indicate it's the first question

          // Explicitly set the answered state for the first question
          const hasAnswered =
            this.selectedOptionService.getSelectedOption() !== null;
          this.selectedOptionService.setAnsweredState(hasAnswered);
          console.log(
            'Initial answered state for the first question:',
            hasAnswered
          );

          this.cdRef.markForCheck(); // Trigger change detection
        } else {
          this.handleNoQuestionsAvailable();
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
        this.handleQuestionsLoadingError();
      },
    });
  }

  private async updateSelectionMessage(
    isAnswered: boolean,
    isFirstQuestion: boolean
  ): Promise<void> {
    const totalQuestions: number = await lastValueFrom(
      this.quizService.totalQuestions$.pipe(take(1))
    );

    let message: string;

    if (!isFirstQuestion || isAnswered) {
      message = this.selectionMessageService.determineSelectionMessage(
        this.currentQuestionIndex,
        totalQuestions,
        isAnswered
      );
    } else {
      // If it's the first question and not answered, set the initial message
      message = 'Please select an option to continue...';
    }

    this.selectionMessageService.updateSelectionMessage(message);
  }

  handleNoQuestionsAvailable(): void {
    this.questions = [];
    this.currentQuestion = null;
    this.questionToDisplay = 'No questions available.';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';
  }

  handleQuestionsLoadingError(): void {
    this.questionToDisplay = 'Error loading questions.';
    this.optionsToDisplay = [];
    this.explanationToDisplay = 'Error loading explanation.';
  }

  handleOptions(options: Option[] = []): void {
    if (!Array.isArray(options) || options.length === 0) {
      console.error('No valid options provided');
      this.options = []; // Set to empty array to avoid errors
      return;
    }
  
    this.options = options.map((option) => ({
      optionId: option.optionId ?? null,
      value: option.value ?? '',
      text: option.text ?? 'N/A',
      isCorrect: option.correct ?? false,
      answer: option.answer ?? null,
      isSelected: false  // Always default to unselected
    })) as Option[];
  
    if (this.selectedQuiz && this.options.length > 1) {
      Utils.shuffleArray(this.options);
    }
  
    this.setOptions();
  }

  handleParamMap(params: ParamMap): void {
    const quizId = params.get('quizId');
    const questionIndex = Number(params.get('questionIndex')) || 0;
  
    this.quizService.setCurrentQuestionIndex(questionIndex);
  
    if (!quizId) {
      console.warn('No quizId found in the route parameters.');
      return;
    }
  
    this.quizDataService.getQuiz(quizId).subscribe({
      next: (quiz) => {
        if (quiz) {
          this.quiz = quiz;
          this.quizService.setQuiz(quiz);
          this.quizDataService.setCurrentQuiz(quiz);
        } else {
          console.warn(`Quiz with ID ${quizId} not found.`);
        }
      },
      error: (err) => {
        console.error(`Error fetching quiz with ID ${quizId}:`, err);
      }
    });
  }

  handleRouteParams(
    params: ParamMap
  ): Observable<{ quizId: string; questionIndex: number; quizData: Quiz }> {
    const quizId = params.get('quizId');
    const questionIndex = Number(params.get('questionIndex'));
  
    // Validate parameters
    if (!quizId) {
      console.error('Quiz ID is missing.');
      return throwError(() => new Error('Quiz ID is required'));
    }
  
    if (isNaN(questionIndex)) {
      console.error('Invalid question index:', params.get('questionIndex'));
      return throwError(() => new Error('Invalid question index'));
    }
  
    // Fetch quiz data and validate
    return this.quizService.getQuizData().pipe(
      map((quizzes: Quiz[]) => {
        const quizData = quizzes.find((quiz) => quiz.quizId === quizId);
        if (!quizData) {
          throw new Error(`Quiz with ID "${quizId}" not found.`);
        }
        return { quizId, questionIndex, quizData };
      }),
      catchError((error: Error) => {
        console.error('Error processing quiz data:', error);
        return throwError(() => new Error('Failed to process quiz data'));
      })
    );
  }

  private handleQuizData(quiz: Quiz | null, currentQuestionIndex: number = 0): void {
    if (!quiz) {
      console.error('Quiz data is not available.');
      return;
    }
  
    const { questions = [] } = quiz;
    if (questions.length === 0) {
      console.error('Quiz questions are missing.');
      return;
    }
  
    this.currentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, questions.length - 1));
    this.question = questions[this.currentQuestionIndex];
  }

  handleQuestion(question: QuizQuestion | null): void {
    if (!question) {
      console.error('Invalid question provided.');
      this.question = null; // Reset the question to avoid stale data
      return;
    }
  
    this.question = question;
  }

  async getQuiz(id: string): Promise<void> {
    try {
      const quiz: Quiz = await firstValueFrom(
        this.quizDataService.getQuiz(id).pipe(
          catchError((error: Error) => {
            console.error('Error fetching quiz:', error);
            return throwError(() => error);
          })
        )
      );
  
      if (quiz && quiz.questions && quiz.questions.length > 0) {
        this.handleQuizData(quiz, this.currentQuestionIndex);
      } else {
        console.warn('Quiz has no questions.');
      }
    } catch (error) {
      console.error('Failed to load quiz:', error);
    }
  }  

  setOptions(): void {
    console.log('Answers:', this.answers);
  
    if (!this.question) {
      console.error('Question not found.');
      return;
    }
  
    if (!Array.isArray(this.options) || this.options.length === 0) {
      console.error('Options are either missing or empty.');
      return;
    }
  
    const options = (this.question.options || []).map((option) => 
      'value' in option ? option.value : 0
    );
  
    console.log('Modified Options Array:', options);
  
    this.quizService.setAnswers(options);
  }

  updateProgressPercentage(): void {
    this.quizService.getTotalQuestionsCount().subscribe({
      next: (total) => this.handleProgressUpdate(total),
      error: (error) => {
        console.error('Error fetching total questions:', error);
        this.progressBarService.setProgress(0); // Ensure progress is reset on error
      },
    });
  }
  
  private handleProgressUpdate(total: number): void {
    this.totalQuestions = total;
  
    const progress = total > 0 
      ? (this.currentQuestionIndex / total) * 100 
      : 0;
  
    this.progressBarService.setProgress(progress);
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  selectedAnswer(option: Option): void {
    // Mark the question as answered
    this.answered = true;
  
    // Check if the answer is correct
    this.quizService.checkIfAnsweredCorrectly();
  
    // Get all correct answers for the question
    this.correctAnswers = this.question.options.filter(opt => opt.correct);
  
    // Handle multiple correct answers
    if (this.correctAnswers.length > 1) {
      // Add the option to answers if it's not already included
      if (!this.answers.includes(option)) {
        this.answers.push(option);
      }
    } else {
      // For single correct answer, replace the first element
      this.answers = [option];
    }
  
    // Notify subscribers of the selected option
    this.selectedOption$.next(option);
  }

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  /************** template logic functions ******************/
  // currently not being used
  isMultipleCorrectAnswers(): boolean {
    return this.numberOfCorrectAnswers > 1;
  }

  // currently not being used
  shouldDisableButton(): boolean {
    return !this.formControl || this.formControl.valid === false;
  }

  // currently not being used
  isNextDisabled(): boolean {
    return typeof this.selectedAnswerField === 'undefined';
  } // might remove


  private async checkIfAnswerSelected(isFirstQuestion: boolean): Promise<void> {
    try {
      console.log('checkIfAnswerSelected called:', { isFirstQuestion });
  
      const isAnswered = await lastValueFrom(
        this.quizService.isAnswered(this.currentQuestionIndex)
      );
  
      console.log('isAnswered from quizService:', isAnswered);
  
      this.selectedOptionService.setAnsweredState(isAnswered);
      this.updateSelectionMessage(isAnswered, isFirstQuestion);
    } catch (error) {
      console.error('Error checking if answer is selected:', error);
    }
  }

  loadCurrentQuestion(): void {
    this.quizService
      .getCurrentQuestionByIndex(this.quizId, this.currentQuestionIndex)
      .pipe(
        tap((question: QuizQuestion | null) => {
          if (question) {
            this.question = question;
  
            // Fetch options using the correct method with arguments
            this.quizService.getCurrentOptions(this.currentQuestionIndex)
              .subscribe({
                next: (options: Option[]) => {
                  this.optionsToDisplay = options || [];
                  console.log('Loaded options:', this.optionsToDisplay);
  
                  // Ensure UI updates
                  this.ngZone.run(() => {
                    this.cdRef.detectChanges();
                  });
                },
                error: (error) => {
                  console.error('Error fetching options:', error);
                  this.optionsToDisplay = []; // Fallback in case of error
                },
              });
          } else {
            console.error('Failed to load question at index:', this.currentQuestionIndex);
          }
        }),
        catchError((error) => {
          console.error('Error fetching question:', error);
          return of(null); // Return fallback observable if needed
        })
      )
      .subscribe();
  }  

  // Method to check if the current question is answered
  get checkIfCurrentQuestionAnswered(): boolean {
    return !!this.isCurrentQuestionAnswered;
  }

  /************************ paging functions *********************/
  async advanceToNextQuestion(): Promise<void> {
    const [isLoading, isNavigating, isEnabled] = await Promise.all([
      firstValueFrom(this.quizStateService.isLoading$),
      firstValueFrom(this.quizStateService.isNavigating$),
      firstValueFrom(this.isButtonEnabled$)
    ]);
    
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('Cannot advance: Loading or navigation in progress, or button is disabled.');
      return;
    }

    this.isNavigating = true;
    
    // Set loading and navigating states
    this.quizStateService.setLoading(true);
    this.quizStateService.setNavigating(true);
  
    try {
      if (this.currentQuestionIndex < this.totalQuestions - 1) {
        this.resetOptionState();
        this.isOptionSelected = false;

        this.currentQuestionIndex++;
        console.log('Navigating to question index:', this.currentQuestionIndex);
  
        this.quizService.setCurrentQuestion(this.currentQuestionIndex);
  
        // Await full preparation of the new question
        await this.loadQuestionContents();
        await this.prepareQuestionForDisplay(this.currentQuestionIndex);
  
        // Reset the answered state for the new question
        this.selectedOptionService.isAnsweredSubject.next(false);
        this.quizStateService.setAnswered(false);
        this.isNextButtonEnabled = false;
        this.isNavigating = false;
  
        // Clear previous explanations if needed
        if (this.quizQuestionComponent) {
          this.quizQuestionComponent.explanationToDisplay = '';
          this.quizQuestionComponent.isAnswered = false;
        }
      
        // Re-enable the next button
        const shouldEnableNextButton = this.isAnyOptionSelected();
        this.updateAndSyncNextButtonState(shouldEnableNextButton);

        console.log('Successfully navigated to the next question.');
      } else {
        console.log('End of quiz reached. Navigating to results.');
        await this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
      }
    } catch (error) {
      console.error('Error during navigation:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);

      // Sync the final state based on the new question
      const finalButtonState = this.isAnyOptionSelected();
      this.updateAndSyncNextButtonState(finalButtonState);
      this.cdRef.detectChanges();
    }
  }
  
  async advanceToPreviousQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;
    this.quizService.setIsNavigatingToPrevious(true);

    try {
      this.resetOptionState();
      this.isOptionSelected = false;

      const previousQuestionIndex = Math.max(this.currentQuestionIndex - 1, 0);
      this.currentQuestionIndex = previousQuestionIndex;

      if (this.sharedOptionComponent) {
        console.log('Navigating backwards');
        this.sharedOptionComponent.isNavigatingBackwards = true;
      } else {
        console.error('SharedOptionComponent is not available when navigating backwards');
      }

      // Combine fetching data and initializing question state into a single method
      await this.loadQuestionContents();
      await this.prepareQuestionForDisplay(this.currentQuestionIndex);

      console.log('Successfully navigated to the previous question.');
      this.resetUI();
    } catch (error) {
      console.error('Error occurred while navigating to the previous question:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
      this.quizService.setIsNavigatingToPrevious(false);
      this.updateAndSyncNextButtonState(false);
      this.cdRef.detectChanges();
    }
  }

  advanceToResults(): void {
    // Reset all quiz-related states
    this.quizService.resetAll();
  
    // Stop the timer and capture the elapsed time
    this.timerService.stopTimer((elapsedTime: number) => {
      this.elapsedTimeDisplay = elapsedTime;
    });
  
    // Reset the timer for future use
    this.timerService.resetTimer();
  
    // Check if the answers are correct and navigate to results
    this.quizService.checkIfAnsweredCorrectly()
      .then(() => {
        this.quizService.navigateToResults();
      })
      .catch((error) => {
        console.error('Error during checkIfAnsweredCorrectly:', error);
      });
  }

  public async advanceAndProcessNextQuestion(): Promise<void> {
    try {
      console.log('Advancing to the next question...');
      await this.quizQuestionComponent.fetchAndProcessCurrentQuestion();
      await this.quizQuestionComponent.loadDynamicComponent();
    } catch (error) {
      console.error('Error advancing to the next question:', error);
    }
  }
  
  // combined method for preparing question data and UI
  async prepareQuestionForDisplay(questionIndex: number): Promise<void> {
    try {
      console.log('Preparing question for display at index:', questionIndex);

      // Fetch question data first to update the UI immediately
      await this.fetchAndSetQuestionData(questionIndex);

      // Run other operations concurrently without blocking UI update
      const processingTasks = [
        this.advanceAndProcessNextQuestion(),
        this.initializeQuestionForDisplay(questionIndex),
        this.updateQuestionStateAndExplanation(questionIndex),
        this.updateNavigationAndExplanationState()
      ];

      await Promise.all(processingTasks);
    } catch (error) {
      console.error('Error preparing question for display:', error);
    }
  }

  initializeQuestionForDisplay(questionIndex: number): void {
    // Validate the questions array and the question index
    if (!this.isValidQuestionIndex(questionIndex)) {
      console.error(`Questions not loaded or invalid index: ${questionIndex}`);
      return;
    }
  
    // Retrieve the state for the current question
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);
  
    // Set the explanation display based on whether the question has been answered
    this.setExplanationDisplay(questionState);
  }
  
  private isValidQuestionIndex(questionIndex: number): boolean {
    return Array.isArray(this.questions) && questionIndex < this.questions.length;
  }
  
  private setExplanationDisplay(questionState: any): void {
    if (questionState?.isAnswered) {
      this.explanationToDisplay = questionState.explanationText;
      this.quizService.shouldDisplayExplanation = true;
    } else {
      this.explanationToDisplay = '';
      this.quizService.shouldDisplayExplanation = false;
    }
  }

  updateNavigationAndExplanationState(): void {
    // Update the current question index in the quiz service
    this.quizService.currentQuestionIndexSource.next(this.currentQuestionIndex);

    // Update the explanation text based on the current question state
    this.updateQuestionStateAndExplanation(this.currentQuestionIndex);

    // Update the progress percentage based on the new current question index
    this.updateProgressPercentage();
  }

  private async fetchAndSetQuestionData(questionIndex: number): Promise<void> {
    try {
      console.log('Fetching question data for index:', questionIndex);

      this.animationState$.next('animationStarted');

      this.resetQuestionState(); // Clear old question data

      const questionDetails = await this.fetchQuestionDetails(questionIndex);
      if (!questionDetails) return;

      const { questionText, options, explanation } = questionDetails;

      // Set the UI state immediately
      this.setQuestionDetails(questionText, options, '');
      this.currentQuestion = { ...questionDetails, options };

      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
      console.log('Current question updated:', this.currentQuestion);

      // Trigger UI refresh
      this.cdRef.detectChanges();

      // Ensure correctness state is checked
      await this.quizService.checkIfAnsweredCorrectly();

      this.explanationToDisplay = explanation || 'No explanation available';

      // Reset UI and navigate after loading the question
      await this.resetUIAndNavigate(questionIndex);
    } catch (error) {
      console.error('Error in fetchAndSetQuestionData:', error);
    }
  }

  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {
    try {
      // Fetch the question text
      const questionTextObservable = this.quizService.getQuestionTextForIndex(questionIndex);
      const questionText = await firstValueFrom(questionTextObservable);
  
      if (!questionText) {
        console.error('No question text found for index:', questionIndex);
        throw new Error('Question text not found');
      }
  
      // Fetch the options
      const options = await this.quizService.getNextOptions(questionIndex);
  
      if (!Array.isArray(options) || options.length === 0) {
        console.error('Invalid or empty options for question at index:', questionIndex);
        throw new Error('Options not found or invalid');
      }
  
      // Fetch the explanation
      const explanationOrObservable = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
      const explanation = typeof explanationOrObservable === 'string'
        ? explanationOrObservable
        : await firstValueFrom(explanationOrObservable);
  
      if (!explanation) {
        console.warn('No explanation text found for question at index:', questionIndex);
      }
  
      // Determine the question type
      const type = options.length > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
  
      // Create the QuizQuestion object
      const question: QuizQuestion = { questionText, options, explanation, type };
  
      // Set the question type in the quiz data service
      this.quizDataService.setQuestionType(question);
  
      return question;
    } catch (error) {
      console.error('Error fetching question details:', error);
      throw error; // Re-throw the error to handle it upstream if necessary
    }
  }

  private setQuestionDetails(
    questionText: string,
    options: Option[],
    explanationText: string
  ): void {
    // Set the question text, providing a default if none is available
    this.questionToDisplay = questionText || 'No question text available';
  
    // Set the options to display, defaulting to an empty array if none are provided
    this.optionsToDisplay = Array.isArray(options) ? options : [];
  
    // Set the explanation text, providing a default if none is available
    this.explanationToDisplay = explanationText || 'No explanation available';
  }

  private async resetUIAndNavigate(questionIndex: number): Promise<void> {
    try {
      // Reset the user interface to its initial state
      this.resetUI();
  
      // Reset the explanation text state between questions
      this.explanationTextService.resetStateBetweenQuestions();
  
      // Navigate to the specified question index
      await this.navigateToQuestion(questionIndex);
    } catch (error) {
      console.error('Error during UI reset and navigation:', error);
    }
  }

  async navigateToQuestion(questionIndex: number): Promise<void> {
    if (this.isLoading || this.debounceNavigation) return;
  
    // Debounce navigation to prevent rapid consecutive calls
    this.debounceNavigation = true;
    const debounceTimeout = 300;
    setTimeout(() => {
      this.debounceNavigation = false;
    }, debounceTimeout);
  
    // Abort any ongoing navigation operations
    if (this.navigationAbortController) {
      this.navigationAbortController.abort();
    }
  
    // Create a new AbortController for the current navigation
    this.navigationAbortController = new AbortController();
    const { signal } = this.navigationAbortController;
  
    // Validate the question index
    if (questionIndex < 0 || questionIndex >= this.totalQuestions) {
      console.warn(`Invalid questionIndex: ${questionIndex}. Navigation aborted.`);
      return;
    }
  
    // Construct the new URL for navigation
    const adjustedIndexForUrl = questionIndex + 1;
    const newUrl = `${QuizRoutes.QUESTION}${encodeURIComponent(this.quizId)}/${adjustedIndexForUrl}`;
  
    this.isLoading = true;
  
    try {
      // Navigate to the new URL
      await this.ngZone.run(() => this.router.navigateByUrl(newUrl));
  
      // Check if navigation was aborted
      if (signal.aborted) {
        console.log('Navigation aborted.');
        return;
      }
  
      // Load the question in the quiz component
      if (this.quizQuestionComponent) {
        await this.quizQuestionComponent.loadQuestion(signal);
      }
    } catch (error) {
      if (signal.aborted) {
        console.log('Navigation was cancelled.');
      } else {
        console.error(`Error navigating to URL: ${newUrl}:`, error);
      }
    } finally {
      // Ensure isLoading is reset regardless of success or failure
      this.isLoading = false;
    }
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    // Reset the current question and options
    this.question = null;
    this.optionsToDisplay = [];
  
    // Log the reset action for debugging purposes
    console.log('QuizComponent - resetUI called');
  
    // Reset the quiz question component if it exists
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.resetFeedback();
      this.quizQuestionComponent.resetState();
    }
  
    // Reset the quiz service state
    this.quizService.resetAll();
  
    // Start the timer with a default duration
    this.timerService.startTimer(30);
  
    // Trigger background reset
    this.resetBackgroundService.setShouldResetBackground(true);
  
    // Trigger state and feedback resets
    this.resetStateService.triggerResetFeedback();
    this.resetStateService.triggerResetState();
  
    // Clear selected options
    this.selectedOptionService.clearOptions();
  
    // Reset explanation state
    this.explanationTextService.resetExplanationState();
  }

  private resetQuestionDisplayState(): void {
    this.questionToDisplay = '';
    this.explanationToDisplay = '';
    this.optionsToDisplay = [];
  }

  restartQuiz(): void {
    // Reset quiz-related services and states
    this.resetQuizState();
  
    // Set the current question index to the first question
    this.quizService.setCurrentQuestionIndex(0);
  
    // Navigate to the first question route
    this.router.navigate(['/question', this.quizId, 1])
      .then(() => {
        // Use setTimeout to allow time for the component to initialize
        setTimeout(async () => {
          try {
            // Ensure the quizQuestionComponent is available
            if (this.quizQuestionComponent) {
              await this.quizQuestionComponent?.fetchAndProcessCurrentQuestion();
              this.quizQuestionComponent?.loadDynamicComponent();
            } else {
              console.error('QuizQuestionComponent not available.');
            }
  
            // Ensure UI reflects the first question properly
            this.resetUI();
            this.resetOptionState();
            this.initializeFirstQuestion();
  
            // Update badge text after reset
            this.quizService.updateBadgeText(1, this.totalQuestions);
          } catch (error) {
            console.error('Error fetching and displaying the first question:', error);
          }
        }, 50); // Adjust the timeout duration if necessary
      })
      .catch((error) => {
        console.error('Error during quiz restart:', error);
      });
  }
  
  private resetQuizState(): void {
    // Reset all quiz-related services
    this.quizService.resetAll();
    this.quizStateService.createDefaultQuestionState();
    this.quizStateService.clearSelectedOptions();
    this.selectionMessageService.resetMessage();
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.resetExplanationText();
  
    // Trigger reset in various services
    this.resetStateService.triggerResetFeedback();
    this.resetStateService.triggerResetState();
  
    // Reset UI-related states
    this.currentQuestionIndex = 0;
    this.progressPercentage.next(0);
    this.score = 0;
  
    // Reset the timer
    this.timerService.stopTimer();
    this.timerService.resetTimer();

    // Clear any lingering UI state and force change detection
    this.questionToDisplay = '';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';

    this.cdRef.detectChanges(); // Ensure the UI reflects these resets immediately
  }

  async setDisplayStateForExplanationsAfterRestart(): Promise<void> {
    try {
      const explanationObservable = this.explanationTextService.getFormattedExplanationTextForQuestion(this.currentQuestionIndex);
  
      const explanation = await firstValueFrom(explanationObservable);
  
      if (explanation) {
        this.explanationTextService.setExplanationText(explanation);
        this.explanationTextService.setShouldDisplayExplanation(true);
      } else {
        console.warn('No explanation available for the first question');
        throw new Error('No explanation available');
      }
    } catch (error) {
      console.error('Error fetching explanation:', error);
      throw new Error('Error fetching explanation');
    }
  }
}