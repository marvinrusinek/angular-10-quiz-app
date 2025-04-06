import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, NgZone, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
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
import { FeedbackService } from '../../shared/services/feedback.service';
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
  providers: [QuizService, QuizDataService, UserPreferenceService]
})
export class QuizComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @ViewChild(QuizQuestionComponent, { static: false })
  quizQuestionComponent!: QuizQuestionComponent;
  @ViewChild(SharedOptionComponent, { static: false })
  sharedOptionComponent!: SharedOptionComponent;
  @ViewChild('nextButton', { static: false })
  nextButtonTooltip!: MatTooltip;
  @Input() data: QuizQuestion;
  @Input() selectedQuiz: Quiz = {} as Quiz;
  @Input() currentQuestion: QuizQuestion | null = null;
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() form: FormGroup;
  quiz: Quiz;
  quizData: QuizData[];
  quizComponentData: QuizComponentData;
  quizId = '';
  quizResources: QuizResource[];
  quizQuestions: QuizQuestion[];
  quizInitialized = false;
  question!: QuizQuestion;
  questions: QuizQuestion[];
  question$!: Observable<[QuizQuestion, Option[]]>;
  questions$: Observable<QuizQuestion[]>;
  currentQuestion$: Observable<QuizQuestion | null> = 
    this.quizStateService.currentQuestion$.pipe(startWith(null));
  currentQuestionType: string;
  currentOptions: Option[] = [];
  options$: Observable<Option[]>;
  options: Option[] = [];
  questionData!: QuizQuestion;

  currentQuiz: Quiz;
  routeSubscription: Subscription;
  routerSubscription: Subscription;
  questionAndOptionsSubscription: Subscription;
  optionSelectedSubscription: Subscription;
  subscriptions: Subscription = new Subscription();
  resources: Resource[];
  answers = [];
  answered = false;
  multipleAnswer = false;
  indexOfQuizId: number;
  status: QuizStatus;
  disabled = true;

  selectedOptions: Option[] = [];
  selectedOption$: BehaviorSubject<Option> = new BehaviorSubject<Option>(null);
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
  feedbackText = '';
  showFeedback = false;
  showFeedbackForOption: { [key: number]: boolean } = {};

  questionToDisplay = '';
  optionsToDisplay: Option[] = [];
  explanationToDisplay = '';
  displayVariables: { question: string; explanation: string };

  private isLoading = false;
  private isQuizLoaded = false; // tracks if the quiz data has been loaded
  private isQuizDataLoaded = false;
  private quizAlreadyInitialized = false;
  questionTextLoaded = false;
  hasLoadingError = false;

  isOptionSelected = false;
  private isCurrentQuestionAnswered = false;

  previousIndex: number | null = null;
  isQuestionIndexChanged = false;
  isQuestionDisplayed = false;

  isQuestionDataReady = false;
  
  isNavigating = false;
  private isNavigatedByUrl = false;
  private debounceNavigation = false;
  private navigatingToResults = false;

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
  isContentAvailable$: Observable<boolean>;
  isContentInitialized = false;

  badgeText$: Observable<string>;
  private hasInitializedBadge = false; // prevents duplicate updates

  shouldDisplayCorrectAnswers = false;

  animationState$ = new BehaviorSubject<AnimationState>('none');
  unsubscribe$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  audioAvailable = true;

  private isNextButtonDisabledSubject = new BehaviorSubject<boolean>(true);
  isNextButtonDisabled$ = this.isNextButtonDisabledSubject.asObservable();

  currentQuestionAnswered = false;

  private questionTextSubject = new BehaviorSubject<string>('');
  public questionText$ = this.questionTextSubject.asObservable();

  private explanationTextSubject = new BehaviorSubject<string>('');
  public explanationText$ = this.explanationTextSubject.asObservable();

  private displayStateSubject = new BehaviorSubject<{ mode: 'question' | 'explanation'; answered: boolean }>({
    mode: 'question',
    answered: false
  });
  displayState$ = this.displayStateSubject.asObservable();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private timerService: TimerService,
    private explanationTextService: ExplanationTextService,
    private feedbackService: FeedbackService,
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
        // Pause updates here (if needed)
      } else {
        this.handleVisibilityChange(); // Resume updates
      }
    });

    this.options$ = this.getOptions(this.currentQuestionIndex);
    this.isContentAvailable$ = this.getContentAvailability();

    this.isAnswered$ = this.selectedOptionService.isAnswered$;

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

    this.quizService.currentQuestion.subscribe({
      next: (newQuestion) => {
        if (!newQuestion) {
          console.warn('No new question received. Skipping UI update.');
          return;
        }
  
        this.ngZone.run(() => {
          this.currentQuestion = null;  // force reset to clear stale UI
  
          setTimeout(() => {
            this.currentQuestion = { ...newQuestion };
          }, 10); // Small delay to ensure UI resets properly
        });
      },
      error: (err) => console.error('Error in currentQuestion subscription:', err),
      complete: () => console.log('currentQuestion subscription completed.')
    });  

    this.quizDataService.isContentAvailable$.subscribe((isAvailable) =>
      console.log('isContentAvailable$ in QuizComponent:::>>>', isAvailable)
    );
    this.isContentAvailable$ = this.quizDataService.isContentAvailable$;
  }

  @HostListener('window:focus', ['$event'])
  onTabFocus(event: FocusEvent): void {
    // Subscribe to restoreStateSubject for handling state restoration
    this.quizStateService.onRestoreQuestionState().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.restoreStateAfterFocus();
      },
      error: (err) => console.error('Error during state restoration on tab focus:', err),
    });
  }

  private async restoreStateAfterFocus(): Promise<void> {
    this.ngZone.run(async () => {
      if (this.isLoading || this.quizStateService.isLoading()) {
        console.warn('[restoreStateAfterFocus] ⚠️ State restoration skipped: Loading in progress.');
        return;
      }

      try {
        // Retrieve last known question index (DO NOT RESET!)
        const savedIndex = localStorage.getItem('savedQuestionIndex');
        let restoredIndex = this.quizService.getCurrentQuestionIndex();

        if (savedIndex !== null) {
          restoredIndex = JSON.parse(savedIndex);
        }

        // Ensure the index is valid
        const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount());
        if (typeof restoredIndex !== 'number' || restoredIndex < 0 || restoredIndex >= totalQuestions) {
          console.warn('Invalid restored index. Keeping latest valid index:', restoredIndex);
        }

        if (this.currentQuestionIndex !== restoredIndex) {
          this.currentQuestionIndex = restoredIndex;
          localStorage.setItem('savedQuestionIndex', JSON.stringify(restoredIndex));
        }

        // Ensure badge text updates correctly
        this.quizService.updateBadgeText(restoredIndex + 1, totalQuestions);
        
        this.cdRef.detectChanges();
      } catch (error) {
        console.error('Error during state restoration:', error);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.selectedOptionService.isAnsweredSubject.subscribe(val =>
      console.log('[🧪 isAnsweredSubject]', val)
    );
    this.quizStateService.isLoading$.subscribe(val =>
      console.log('[🧪 isLoading$]', val)
    );
    this.quizStateService.isNavigating$.subscribe(val =>
      console.log('[🧪 isNavigating$]', val)
    );    

    this.initializeDisplayVariables();
  
    // ✅ Centralized routing + quiz setup
    this.initializeQuizData();
  
    // 🔍 (Optional) Log router navigation events for debugging
    /* this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        console.log('[DEBUG] 🚀 NavigationEnd Event:', event);
      }
    }); */
  
    // ✅ Total questions and badge setup
    this.quizService.getTotalQuestionsCount().subscribe(totalQuestions => {
      if (totalQuestions > 0) {
        this.totalQuestions = totalQuestions;
        const startingIndex = this.quizService.getCurrentQuestionIndex();
  
        if (!this.hasInitializedBadge) {
          this.quizService.updateBadgeText(startingIndex + 1, totalQuestions);
          this.hasInitializedBadge = true;
        } else {
          console.log('Badge already initialized, skipping duplicate update.');
        }
      } else {
        console.warn('Total questions not available yet.');
      }
    });
  
    // ✅ Progress bar sync
    this.progressBarService.progress$.subscribe((progressValue) => {
      this.progressPercentage.next(progressValue);
    });
    this.progressBarService.setProgress(0);
  
    // ✅ Answer state and navigation setup
    this.subscribeToOptionSelection();
    this.handleNavigationToQuestion(this.currentQuestionIndex);
    this.initializeNextButtonState();
    this.initializeTooltip();
    this.resetOptionState();
    // this.selectedOptionService.setAnswered(false);
    this.resetQuestionState();
    this.subscribeToSelectionMessage();
  
    // 🧠 Explanation text subscription
    this.quizService.nextExplanationText$.subscribe((text) => {
      this.explanationToDisplay = text;
    });
  
    // 🧩 Initialize any quiz-specific data
    this.initializeQuestions();
    this.initializeCurrentQuestion();
    this.checkIfAnswerSelected();
  }
  

  /* this.options$ = this.quizService.getCurrentOptions(this.currentQuestionIndex).pipe(
      tap((options) => console.log('options$ emitted:::::', options)),
      catchError((error) => {
        console.error('Error in options$:', error);
        return of([]); // Fallback to empty array
      })
    ); */

    /* this.isContentAvailable$ = combineLatest([this.currentQuestion$, this.options$]).pipe(
      map(([question, options]) => {
        console.log('isContentAvailable$ check:', { question, options });
        return !!question && options?.length > 0;
      }),
      distinctUntilChanged(),
      catchError((error) => {
        console.error('Error in isContentAvailable$:', error);
        return of(false);
      }),
      startWith(false)
    ); */


  ngAfterViewInit(): void {
    this.initializeDisplayVariables();
    this.loadQuestionContents(this.currentQuestionIndex);
  }

  public onAnsweredChange(isAnswered: boolean): void {
    if (!this.isNavigating) {
      this.selectedOptionService.setAnswered(isAnswered);
      this.evaluateNextButtonState();
    }
  }

  initializeDisplayVariables(): void {
    this.displayVariables = {
      question: this.questionToDisplay || 'No question available',
      explanation: this.explanationToDisplay || 'Explanation unavailable',
    };

    console.log('Display Variables:', this.displayVariables);
  }

  private async handleVisibilityChange(): Promise<void> {
    const currentIndex = this.quizService.getCurrentQuestionIndex();
    try { 
      // Ensure questions are loaded
      if (!Array.isArray(this.questions) || this.questions.length === 0) {
        console.warn('Questions not loaded, calling loadQuizData...');
        await this.loadQuizData(); // Ensure loading before proceeding
      }

      const totalQuestions = await firstValueFrom(this.quizService.getTotalQuestionsCount());

      if (typeof currentIndex === 'number' && currentIndex >= 0 && currentIndex < totalQuestions) {
        this.updateQuestionDisplay(currentIndex); // Ensure question state is restored
      } else {
        console.warn('Invalid or out-of-range question index on visibility change.');
      }
    } catch (error) {
      console.error('Error retrieving total questions count:', error);
    }
  }

  async loadQuestionContents(questionIndex: number): Promise<void> { 
    try {
        console.log(`[QuizComponent] 🚀 Loading content for Q${questionIndex} at ${new Date().toISOString()}`);
        console.trace(`[QuizComponent] Stack Trace - loadQuestionContents() for Q${questionIndex}`);

        this.isLoading = true;
        this.isQuestionDisplayed = false;
        this.isNextButtonEnabled = false;

        // ✅ Reset state before fetching new data
        this.optionsToDisplay = [];
        this.questionData = null;
        this.explanationToDisplay = '';

        this.cdRef.detectChanges();

        const quizId = this.quizService.getCurrentQuizId();
        if (!quizId) {
            console.warn(`[QuizComponent] ❌ No quiz ID available. Cannot load question contents.`);
            return;
        }

        try {
            type FetchedData = { question: QuizQuestion | null; options: Option[] | null; explanation: string | null };

            const question$ = this.quizService.getCurrentQuestionByIndex(quizId, questionIndex).pipe(take(1));
            const options$ = this.quizService.getCurrentOptions(questionIndex).pipe(take(1));
            const explanation$ = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex).pipe(take(1));

            const data: FetchedData = await lastValueFrom(
                forkJoin({ question: question$, options: options$, explanation: explanation$ }).pipe(
                    tap(finalData => console.log(`[QuizComponent] ✅ forkJoin completed for Q${questionIndex}:`, finalData)),
                    catchError(error => {
                        console.error(`[QuizComponent] ❌ Error in forkJoin for Q${questionIndex}:`, error);
                        return of({ question: null, options: [], explanation: '' } as FetchedData);
                    })
                )
            );

            // ✅ Validate retrieved data
            console.log(`[QuizComponent] 🔍 Raw question data for Q${questionIndex}:`, data.question);
            console.log(`[QuizComponent] 🔍 Raw options data for Q${questionIndex}:`, data.options);
            console.log(`[QuizComponent] 🔍 Raw explanation data for Q${questionIndex}:`, data.explanation);

            if (!data.options || data.options.length === 0) {
                console.warn(`[QuizComponent] ⚠️ No options found for Q${questionIndex}. Skipping update.`);
                return;
            }

            // ✅ Verify if the correct question index is being used
            console.log(`[QuizComponent] 🔍 BEFORE Feedback Processing for Q${questionIndex}:`, data.options);

            // ✅ Extract correct options **for the current question**
            const correctOptions = data.options.filter(opt => opt.correct);
            console.log(`[QuizComponent] 🔍 Correct options for Q${questionIndex}:`, correctOptions);

            // ✅ Ensure `generateFeedbackForOptions` receives correct data for each question
            console.log(`[QuizComponent] 🚀 Calling generateFeedbackForOptions for Q${questionIndex}`);
            const feedbackMessage = this.feedbackService.generateFeedbackForOptions(correctOptions, data.options);
            console.log(`[QuizComponent] ✅ Generated feedback for Q${questionIndex}:`, feedbackMessage);

            // ✅ Apply the **same feedback message** to all options
            const updatedOptions = data.options.map((opt) => ({
                ...opt,
                feedback: feedbackMessage
            }));
            console.log(`[QuizComponent] 🔍 Checking updatedOptions before setting optionsToDisplay for Q${questionIndex}:`, updatedOptions);

            // ✅ Double-check the assigned feedback before setting optionsToDisplay
            console.log(`[QuizComponent] 🔍 FINAL optionsToDisplay before passing to QQC for Q${questionIndex}:`, updatedOptions);
            
            console.log(`[QuizComponent] 🔍 FINAL optionsToDisplay before passing to QQC for Q${questionIndex}:`, updatedOptions);

            // ✅ Set values **ONLY AFTER ensuring correct mapping**
            this.optionsToDisplay = [...updatedOptions];
            console.log(`[QuizComponent] 🚀 Assigned optionsToDisplay for Q${questionIndex}:`, this.optionsToDisplay);
            console.log(`[QuizComponent] 🔍 FINAL optionsToDisplay before passing to QQC for Q${questionIndex}:`, this.optionsToDisplay);

            this.questionData = data.question ?? ({} as QuizQuestion);
            
            // this.explanationToDisplay = data.explanation ?? '';

            this.isQuestionDisplayed = true;
            this.isLoading = false;

            console.log(`[QuizComponent] 🎯 Successfully loaded content for Q${questionIndex}`);
            console.log(`[QuizComponent] 🚀 Final optionsToDisplay for Q${questionIndex}:`, this.optionsToDisplay);
            
            this.cdRef.detectChanges();
        } catch (error) {
            console.error(`[QuizComponent] ❌ Error loading question contents for Q${questionIndex}:`, error);
            this.isLoading = false;
            this.cdRef.detectChanges();
        }
    } catch (error) {
        console.error(`[QuizComponent] ❌ Unexpected error:`, error);
        this.isLoading = false;
        this.cdRef.detectChanges();
    }
  }

  private restoreQuestionState(): void {
    this.quizService.getCurrentQuestion(this.currentQuestionIndex).subscribe({
      next: (question: QuizQuestion) => {
        if (question) { 
          const questionType: QuestionType = question.type || 'single' as QuestionType; // Cast fallback to QuestionType
          this.quizDataService.setQuestionType({ ...question, type: questionType }); // Restore question type
          this.updateQuestionDisplay(this.currentQuestionIndex);
        } else {
          console.warn('Failed to restore question state: Question not found.');
        }
      },
      error: (error) => {
        console.error('Error restoring question state:', error);
      },
    });
  }

  private async restoreSelectionState(): Promise<void> {
    try {
      const selectedOptions = this.selectedOptionService.getSelectedOptionIndices(this.currentQuestionIndex);
    
      // Re-apply selected states to options
      for (const optionId of selectedOptions) {
        this.selectedOptionService.addSelectedOptionIndex(this.currentQuestionIndex, optionId);
      }
    
      console.log(`Restored selected options for question ${this.currentQuestionIndex}:`, selectedOptions);
    
      // Get the question options to update the answered state
      const questionOptions = this.selectedOptionService.selectedOptionsMap.get(this.currentQuestionIndex) || [];
    
      // Update the answered state
      this.selectedOptionService.updateAnsweredState(questionOptions, this.currentQuestionIndex);
    } catch (error) {
      console.error('[restoreSelectionState] Unhandled error:', error);
    }
  }

  private async handleNavigationToQuestion(questionIndex: number): Promise<void> {
    this.quizService.getCurrentQuestion(questionIndex).subscribe({
      next: async (question: QuizQuestion) => {
        // Reset currentQuestionType
        if (question) {
          if (question.type !== null || question.type !== undefined) {
            this.quizDataService.setQuestionType(question);
          } else {
            console.error('Question type is undefined or null:', question);
          }          
        } else {
          console.warn('No question data available for the given index.');
        }
  
        // Restore previously selected options, if any
        await this.restoreSelectionState();

        // Re-evaluate the Next button state
        this.evaluateNextButtonState();
      },
      error: (err) => {
        console.error('Error fetching question:', err);
      },
    });
  }
  
  private initializeNextButtonState(): void {
    console.log('[🧪 QuizComponent] initializing button state stream...');

    this.isButtonEnabled$ = combineLatest([
      this.selectedOptionService.isAnsweredSubject,
      this.quizStateService.isLoading$,
      this.quizStateService.isNavigating$
    ]).pipe(
      map(([isAnswered, isLoading, isNavigating]) => {
        const isEnabled = isAnswered && !isLoading && !isNavigating;
        console.log('[🧪 isButtonEnabled$]', { isAnswered, isLoading, isNavigating, isEnabled });
        return isEnabled;
      }),
      distinctUntilChanged(),
      shareReplay(1)
    );
  
    this.isButtonEnabled$.subscribe((isEnabled) => {
      console.log('[🧪 isButtonEnabled$ subscription fired]:', isEnabled);
      this.updateAndSyncNextButtonState(isEnabled);
    });
  }  
  
  private evaluateNextButtonState(): boolean {
    // 🔄 Clear any residual option state before evaluation
    this.resetOptionState();
  
    // 🔍 Get current state flags
    const isAnswered = this.selectedOptionService.isAnsweredSubject.getValue();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
    console.log('[🧪 evaluateNextButtonState]', { isAnswered, isLoading, isNavigating });
  
    // ✅ Force enable Next button for multiple-answer questions (temp logic)
    if (this.currentQuestionType === QuestionType.MultipleAnswer) {
      console.log('[🟢 Multi-answer] Forcing Next button enabled.');
      this.updateAndSyncNextButtonState(true);
      return true;
    }
  
    // ✅ Standard rule: enable only if answered, not loading/navigating
    const shouldEnable = isAnswered && !isLoading && !isNavigating;
  
    // 🔄 Update reactive state
    this.isButtonEnabledSubject.next(shouldEnable);
    this.isNextButtonEnabled = shouldEnable;
    this.updateAndSyncNextButtonState(shouldEnable);
  
    console.log('[🔁 Next Button Evaluated]', { shouldEnable });
  
    return shouldEnable;
  }

  updateAndSyncNextButtonState(isEnabled: boolean): void {
    this.ngZone.run(() => {
      console.log('[🔄 updateAndSyncNextButtonState] Next button enabled:', isEnabled);
      this.isNextButtonEnabled = isEnabled;
      this.isButtonEnabledSubject.next(isEnabled);
  
      this.nextButtonStyle = {
        opacity: isEnabled ? '1' : '0.5',
        'pointer-events': isEnabled ? 'auto' : 'none',
      };
  
      this.cdRef.markForCheck();
    });
  
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
      this.nextButtonTooltip.show(); // Show the tooltip programmatically
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

  onOptionSelected(
    event: { option: SelectedOption; index: number; checked: boolean },
    isUserAction: boolean = true
  ): void {
    if (!isUserAction) return;
  
    const { option, checked } = event;
  
    // Handle selection logic based on question type
    if (this.currentQuestion.type === QuestionType.SingleAnswer) {
      this.selectedOptions = checked ? [option] : [];
    } else {
      this.updateMultipleAnswerSelection(option, checked);
    }
  
    // ✅ Only set isAnswered if it hasn't been set already
    const currentAnswered = this.selectedOptionService.isAnsweredSubject.getValue();
    if (!currentAnswered) {
      this.selectedOptionService.setAnswered(true);
      console.log('[✅ onOptionSelected] Question marked as answered.');
    } else {
      console.log('[ℹ️ onOptionSelected] Already answered — skipping duplicate update.');
    }
  
    this.isAnswered = true;
    sessionStorage.setItem('isAnswered', 'true');
    sessionStorage.setItem(`displayMode_${this.currentQuestionIndex}`, 'explanation');
    sessionStorage.setItem('displayExplanation', 'true');
  
    // 🔄 Sync quiz state service
    this.quizStateService.setAnswerSelected(true);
  
    // ✅ Evaluate next button state after selection
    this.evaluateNextButtonState();
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
    this.selectedOptions = [];
    this.currentQuestionAnswered = false;
    this.isNextButtonEnabled = false;
    this.isButtonEnabled = false;
    this.isButtonEnabledSubject.next(false);

    // Clear selected, highlight, and activation states for options
    if (this.currentQuestion?.options) {
      for (const option of this.currentQuestion.options) {
        if (option.selected) {
          console.log(`Clearing selected state for option: ${option.optionId}`);
          option.selected = false;     // Clear selected state
          option.highlight = false;    // Clear highlight state
          option.active = true;        // Reactivate the option
        }
      }
    }

    // Reset timer and selected options logic
    this.selectedOptionService.stopTimerEmitted = false;
    this.selectedOptionService.selectedOptionsMap.clear();

    // this.quizStateService.setAnswered(false);
    // this.quizStateService.setLoading(false);
    this.cdRef.detectChanges();
  }

  private resetOptionState(): void {
    this.isOptionSelected = false;
  
    // Clear both selection and answered state
    this.selectedOptionService.setOptionSelected(false);
    // this.selectedOptionService.setAnswered(false);
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

    if (this.nextButtonTooltip) {
      this.nextButtonTooltip.disabled = true; // Disable tooltips
      this.nextButtonTooltip.hide(); // Hide any active tooltip
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentQuestionIndex']) {
      this.loadCurrentQuestion();
    }

    if (changes['currentQuestion']) {
      console.log('[QuizComponent] 🔄 currentQuestion changed:', changes['currentQuestion'].currentValue);
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
    return !!this.currentQuestion && this.options?.length > 0;
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
  initializeQuestions(): void {
    this.quizService.getShuffledQuestions().subscribe({
      next: (questions) => {
        if (questions && questions.length > 0) {
          this.questions = questions;
          console.log('Shuffled questions received:', this.questions);
        } else {
          console.error('[initializeQuestions] No questions received.');
        }
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
      }
    });
  }

  /*************** ngOnInit barrel functions ******************/
  /* potentially remove: 
    private initializeRouteParameters(): void {
    this.fetchRouteParams();
    this.subscribeRouterAndInit();
    this.subscribeToRouteParams();
    this.initializeRouteParams();
  } */

  private initializeQuizData(): void {
    this.resolveQuizData();
    this.fetchQuizData();
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

  private async loadQuizData(): Promise<boolean> {
    if (this.isQuizLoaded) {
        console.log('Quiz data already loaded, skipping load.');
        return true;
    }

    if (!this.quizId) {
        console.error('Quiz ID is missing. Cannot fetch quiz data.');
        return false;
    }

    try {
        const quiz = await firstValueFrom(
            this.quizDataService.getQuiz(this.quizId).pipe(take(1), takeUntil(this.destroy$))
        ) as Quiz;

        if (!quiz) {
            console.error('Quiz is null or undefined. Failed to load quiz data.');
            return false;
        }

        if (!quiz.questions || quiz.questions.length === 0) {
            console.error('Quiz has no questions or questions array is missing:', quiz);
            return false;
        }

        console.log(`[QuizComponent] ✅ Loaded Quiz with ${quiz.questions.length} questions.`);

        // Assign quiz data
        this.quiz = quiz;
        this.questions = quiz.questions;
        this.currentQuestion = this.questions[this.currentQuestionIndex];
        this.isQuizLoaded = true;

        return true;
    } catch (error) {
        console.error('Error loading quiz data:', error);
        return false;
    } finally {
        if (!this.isQuizLoaded) {
            console.warn('Quiz loading failed. Resetting questions to an empty array.');
            this.questions = [];
        }
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
      this.loadAndSetupQuestion(this.currentQuestionIndex);
    });
  }
  
  private async initializeRouteParams(): Promise<void> {
    // **1️⃣ Ensure questions are loaded before processing route parameters**
    const loadedSuccessfully = await this.ensureQuestionsLoaded();
    if (!loadedSuccessfully) {
      console.error('Aborting route param initialization due to failed quiz load.');
      return; // Stop if loading fails
    }
  
    // Handle route parameters only if questions are loaded
    this.activatedRoute.params.subscribe(async (params) => {
      this.quizId = params['quizId'];
  
      // Determine and adjust the question index from route parameters
      const routeQuestionIndex = params['questionIndex'] !== undefined ? +params['questionIndex'] : 1;
      const adjustedIndex = Math.max(0, routeQuestionIndex - 1);
  
      console.log(`[initializeRouteParams] QuizId: ${this.quizId}, Route Question Index: ${routeQuestionIndex}, Adjusted Index: ${adjustedIndex}`);
  
      // Wait for questions to load before updating the display
      await this.waitForQuestionsToLoad();
  
      if (Array.isArray(this.questions) && this.questions.length > 0) {
        if (adjustedIndex === 0) {
          console.log('[initializeRouteParams] Initializing first question...');
          await this.initializeFirstQuestion(); // Wait for first question to be initialized
        } else {
          console.log(`[initializeRouteParams] Updating question display for index: ${adjustedIndex}`);
          this.updateQuestionDisplay(adjustedIndex);
        }
      } else {
        console.error('[initializeRouteParams] Questions failed to load before route parameter processing.');
      }
    });
  }  

  private async ensureQuestionsLoaded(): Promise<boolean> {
    if (this.isQuizLoaded) {
      return true; // Skip loading if already loaded
    }
    console.log('Questions not loaded, calling loadQuizData...');
    const loadedSuccessfully = await this.loadQuizData();
    this.isQuizLoaded = loadedSuccessfully;
    return loadedSuccessfully;
  }

  // Utility function to wait for questions to load
  private async waitForQuestionsToLoad(): Promise<void> {
    while (!Array.isArray(this.questions) || this.questions.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100)); // Check every 100ms
    }
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
      const questionIndexParam = this.activatedRoute.snapshot.params['questionIndex'];
      const questionIndex = parseInt(questionIndexParam, 10);
  
      if (isNaN(questionIndex)) {
        console.error('Invalid question index:', questionIndexParam);
        return;
      }
  
      const zeroBasedQuestionIndex = questionIndex - 1;
  
      const selectedQuiz: Quiz | null = await firstValueFrom(
        this.quizDataService.getQuiz(quizId).pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            console.error('Error fetching quiz:', err);
            return of(null); // Return null to handle the empty case
          }),
          filter((quiz) => !!quiz) // Ensure that only valid, non-null quizzes are passed
        )
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
  
      const questionData = await this.fetchQuestionData(quizId, zeroBasedQuestionIndex);
      if (!questionData) {
        console.error('Question data could not be fetched.');
        this.data = null;
        return;
      }
  
      this.initializeAndPrepareQuestion(questionData, quizId);
    } catch (error) {
      console.error('Error in fetchQuizData:', error);
    }
  }

  private initializeQuiz(): void {
    if (this.quizAlreadyInitialized) {
      console.warn('[🛑 initializeQuiz] Already initialized. Skipping...');
      return;
    }
  
    console.log('[✅ initializeQuiz] Starting quiz init...');
    this.quizAlreadyInitialized = true;
  
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
    // Force clear to prevent stale or mismapped explanations
    this.explanationTextService.formattedExplanations = {};

    const explanationObservables = this.quiz.questions.map(
      (question, index) =>
        this.explanationTextService.formatExplanationText(question, index)
    );
  
    return forkJoin(explanationObservables).pipe(
      tap((explanations) => {
        for (const explanation of explanations) {
          const { questionIndex, explanation: text } = explanation;
          const q = this.quiz?.questions?.[questionIndex];
        }
  
        console.log('✅ All explanations preloaded and logged.');
      }),
      map(() => true), // Ensure this Observable resolves to true
      catchError((err) => {
        console.error('❌ Error preloading explanations:', err);
        return of(false);
      })
    );
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

      // Prepare and display feedback
      setTimeout(() => {
        this.prepareFeedback(); // Call after options are loaded
      }, 100); // Add slight delay to ensure options are loaded

      this.isNavigatedByUrl = false;
    } else {
      console.log('No index change detected, still on index:', adjustedIndex);
    }
  }

  resetExplanationText(): void {
    this.explanationToDisplay = '';
  }

  // This function loads the question corresponding to the provided index.
  async loadQuestionByRouteIndex(questionIndex: number): Promise<void> {
    try {
      console.log(`[loadQuestionByRouteIndex] 🚀 Navigating to Q${questionIndex}`);
  
      if (!this.quiz || questionIndex < 0 || questionIndex >= this.quiz.questions.length) {
        console.error('[loadQuestionByRouteIndex] ❌ Question index out of bounds:', questionIndex);
        return;
      }
  
      this.resetFeedbackState();
  
      const question = this.quiz.questions[questionIndex];
      this.questionToDisplay = question.questionText?.trim() ?? 'No question available';
  
      const optionsWithIds = this.quizService.assignOptionIds(question.options || []);
      this.optionsToDisplay = optionsWithIds.map((option, index) => ({
        ...option,
        feedback: 'Loading feedback...',
        showIcon: option.showIcon ?? false,
        active: option.active ?? true,
        selected: option.selected ?? false,
        correct: !!option.correct,
        optionId: typeof option.optionId === 'number' && !isNaN(option.optionId) ? option.optionId : index + 1
      }));
  
      console.log('[loadQuestionByRouteIndex] ✅ Options to Display:', this.optionsToDisplay);
  
      const correctOptions = this.optionsToDisplay.filter(opt => opt.correct);
      if (!correctOptions.length) {
        console.warn('[loadQuestionByRouteIndex] ⚠️ No correct answers found for this question.');
      }
  
      // Restore and apply feedback
      setTimeout(() => {
        this.restoreSelectedOptions();
  
        setTimeout(() => {
          if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
            console.warn('[loadQuestionByRouteIndex] ⚠️ optionsToDisplay is empty! Attempting fallback...');
            this.quizQuestionComponent?.populateOptionsToDisplay();
          }
  
          const previouslySelectedOption = this.optionsToDisplay.find(opt => opt.selected);
          if (previouslySelectedOption) {
            this.quizQuestionComponent?.applyOptionFeedback(previouslySelectedOption);
          } else {
            console.log('[loadQuestionByRouteIndex] ℹ️ No previously selected option. Applying feedback to all.');
            this.quizQuestionComponent?.applyOptionFeedbackToAllOptions();
          }
  
          this.cdRef.detectChanges();
          this.cdRef.markForCheck();
        }, 50);
      }, 150);
  
      // ✅ Fetch explanation first (this is NOT async — it sets internal state)
      this.fetchFormattedExplanationText(questionIndex);
  
      // ✅ Now await feedback generation
      try {
        const feedback = await (this.quizQuestionComponent?.generateFeedbackText(question) ?? Promise.resolve(''));
        this.feedbackText = feedback;
        console.log('[loadQuestionByRouteIndex] 🧠 Feedback Text:', feedback);
      } catch (error) {
        console.error('[loadQuestionByRouteIndex] ❌ Feedback generation failed:', error);
        this.feedbackText = 'Could not generate feedback. Please try again.';
      }
  
      // Final UI update after async work
      setTimeout(() => {
        this.cdRef.detectChanges();
        this.cdRef.markForCheck();
      }, 200);
  
    } catch (error) {
      console.error('[loadQuestionByRouteIndex] ❌ Unexpected error:', error);
      this.feedbackText = 'Error loading question details.';
      this.cdRef.markForCheck();
    }
  }

  private restoreSelectedOptions(): void {
    console.log('[restoreSelectedOptions] 🔄 Restoring selected options...');
  
    const selectedOptionsData = sessionStorage.getItem(`selectedOptions`);
    if (!selectedOptionsData) {
      console.warn('[restoreSelectedOptions] ❌ No selected options data found.');
      return;
    }
  
    try {
      const selectedOptions = JSON.parse(selectedOptionsData);
      if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
        console.warn('[restoreSelectedOptions] ❌ No valid selected options to restore.');
        return;
      }
  
      selectedOptions.forEach(option => {
        const restoredOption = this.optionsToDisplay.find(opt => opt.optionId === option.optionId);
        if (restoredOption) {
          restoredOption.selected = true; // ✅ Set option as selected
          console.log('[restoreSelectedOptions] ✅ Restored option as selected:', restoredOption);
        } else {
          console.warn('[restoreSelectedOptions] ❌ Option not found in optionsToDisplay:', option);
        }
      });
  
    } catch (error) {
      console.error('[restoreSelectedOptions] ❌ Error parsing selected options:', error);
    }
  }

  private resetFeedbackState(): void {
    console.log('[resetFeedbackState] 🔄 Resetting feedback state...');
    this.showFeedback = false;
    this.showFeedbackForOption = {};
    this.optionsToDisplay.forEach(option => {
      option.feedback = '';
      option.showIcon = false;
      option.selected = false; // Reset selection before reapplying
    });
    this.cdRef.detectChanges();
  }

  fetchFormattedExplanationText(index: number): void {
    this.resetExplanationText(); // Reset explanation text before fetching

    if (index in this.explanationTextService.formattedExplanations) {
      const explanationObj =
        this.explanationTextService.formattedExplanations[index];
      this.explanationToDisplay = explanationObj?.explanation ?? 'No explanation available for this question.';

      // Confirm feedback application here
      // this.quizQuestionComponent?.applyOptionFeedbackToAllOptions();
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
    const firstQuestion = this.quizService.getQuestionByIndex(0);
    if (!firstQuestion) {
      console.error('[refreshQuestionOnReset] ❌ No question found at index 0.');
      return;
    }
  
    // Update the current question
    firstValueFrom(firstQuestion).then((question) => {
      if (question) {
        this.quizService.setCurrentQuestion(question);
        this.loadCurrentQuestion();
      } else {
        console.error('[refreshQuestionOnReset] ❌ Failed to fetch question at index 0.');
      }
    }).catch((error) => {
      console.error('[refreshQuestionOnReset] ❌ Error fetching first question:', error);
    });
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
  
    const data: QuizQuestion = { 
      questionText: questionData.questionText,
      explanation: questionData.explanation || '',  // ensure explanation exists
      options: questionData.options || [],
      type: (questionData.type as QuestionType) ?? QuestionType.SingleAnswer
    };
    
    // ✅ Assign only valid `QuizQuestion` fields
    this.data = data; // ✅ Now `this.data` is of type `QuizQuestion`
  
    // Set Quiz ID
    this.quizService.setQuizId(quizId);
  
    // Fetch and set quiz questions
    this.quizService
      .fetchQuizQuestions(quizId)
      .then((questions) => {
        this.quizService.setQuestionData(questions);
      })
      .catch((error) => {
        console.error('Error fetching questions:', error);
      });
  
    // Log received questionData
    console.log('Initializing question with data:', this.data);
  
    // Subscribe to current options with filter and take
    this.quizStateService.currentOptions$
      .pipe(
        filter((options: Option[]) => options && options.length > 0), // Only process non-empty options
        take(1) // Automatically unsubscribe after the first valid emission
      )
      .subscribe({
        next: (options: Option[]) => {
          console.log('Received options from currentOptions$:', options);
  
          // Create currentQuestion object
          const currentQuestion: QuizQuestion = {
            questionText: this.data.questionText,
            options: options.map((option) => ({
              ...option,
              correct: option.correct ?? false, // Default to false if `correct` is undefined
            })),
            explanation: this.explanationTextService.formattedExplanationSubject.getValue(),
            type: this.quizDataService.questionType as QuestionType,
          };
          this.question = currentQuestion;
  
          // Filter correct answers
          const correctAnswerOptions = currentQuestion.options.filter(
            (option: Option) => option.correct
          );
  
          if (correctAnswerOptions.length === 0) {
            console.error(
              `No correct options found for question: "${currentQuestion.questionText}". Options:`,
              currentQuestion.options
            );
            return; // Exit early to avoid setting invalid correct answers
          }
  
          // Set correct answers if valid options are found
          this.quizService
            .setCorrectAnswers(currentQuestion, correctAnswerOptions)
            .subscribe({
              next: () => {
                this.prepareFeedback();
              },
              error: (err) => {
                console.error('Error setting correct answers:', err);
              },
            });
  
          // Mark correct answers as loaded
          this.quizService.setCorrectAnswersLoaded(true);
          this.quizService.correctAnswersLoadedSubject.next(true);
  
          console.log('Correct Answer Options:', correctAnswerOptions);
        },
        error: (err) => {
          console.error('Error subscribing to currentOptions$:', err);
        },
        complete: () => {
          console.log('Subscription to currentOptions$ completed after first valid emission.');
        },
      });
  }

  private prepareFeedback(): void {
    console.log('[prepareFeedback] Triggered.');
  
    // Validate that options are available for feedback preparation
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.warn('[prepareFeedback] No options available to prepare feedback.');
      return;
    }
  
    try {
      // Apply feedback to options through QuizQuestionComponent
      // this.quizQuestionComponent?.applyOptionFeedbackToAllOptions();
      this.showFeedback = true; // Enable feedback display
  
      // Trigger change detection to update the UI
      this.cdRef.detectChanges();
  
      console.log('[prepareFeedback] Feedback successfully prepared for options:', this.optionsToDisplay);
    } catch (error) {
      console.error('[prepareFeedback] Error while applying feedback:', error);
    }
  }

  private initializeQuizBasedOnRouteParams(): void {
    this.activatedRoute.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params: ParamMap) => {
          const quizId = params.get('quizId');
          const questionIndexParam = params.get('questionIndex');
          const routeIndex = questionIndexParam ? Number(questionIndexParam) : 1;
          const internalIndex = Math.max(routeIndex - 1, 0); // ✅ Convert to 0-based
  
          console.log(`[Route Init] 📍 quizId=${quizId}, routeIndex=${routeIndex}, internalIndex=${internalIndex}`);
  
          if (!quizId) {
            console.error('[Route Init] ❌ No quizId found in URL.');
            return EMPTY;
          }
  
          this.quizId = quizId;
          this.currentQuestionIndex = internalIndex;
  
          return this.handleRouteParams(params).pipe(
            catchError((error: Error) => {
              console.error('[Route Init] ❌ Error in handleRouteParams:', error);
              return EMPTY;
            })
          );
        }),
        switchMap((data) => {
          const { quizData, questionIndex } = data;
  
          if (!quizData || !Array.isArray(quizData.questions)) {
            console.error('[Route Init] ❌ Invalid quiz data or missing questions array.', quizData);
            return EMPTY;
          }
  
          const lastIndex = quizData.questions.length - 1;
          const adjustedIndex = Math.min(questionIndex, lastIndex);
          this.currentQuestionIndex = adjustedIndex;
  
          // ✅ Apply quiz data + state
          this.quizService.setActiveQuiz(quizData);
          this.quizService.setCurrentQuestionIndex(adjustedIndex);
          this.initializeQuizState();
  
          return this.quizService.getQuestionByIndex(adjustedIndex);
        }),
        catchError((error: Error) => {
          console.error('[Route Init] ❌ Failed to initialize quiz:', error);
          return EMPTY;
        })
      )
      .subscribe({
        next: async (question: QuizQuestion | null) => {
          if (!question) {
            console.error('[Route Init] ❌ No question returned.');
            return;
          }
  
          this.currentQuiz = this.quizService.getActiveQuiz();
  
          console.log(`[Route Init] ✅ Question Loaded: Q${this.currentQuestionIndex}`);
  
          // 👇 Ensures everything resets and loads cleanly
          await this.resetUIAndNavigate(this.currentQuestionIndex);
        },
        complete: () => {
          console.log('[Route Init] 🟢 Initialization complete.');
        }
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
      if (questions && questions.length > 0) {
        this.currentQuestionIndex = 0;
  
        // Reset and set initial state for each question
        for (const [index, question] of questions.entries()) {
          const defaultState: QuestionState = this.quizStateService.createDefaultQuestionState();
          this.quizStateService.setQuestionState(this.quizId, index, defaultState);
        }        
  
        // Set initial question and options
        this.currentQuestion = questions[this.currentQuestionIndex];
  
        // Ensure options have the `correct` property explicitly set
        this.options = this.currentQuestion.options.map(option => ({
          ...option,
          correct: option.correct ?? false, // Default `correct` to false if undefined
        }));
  
        console.log('Questions loaded:', questions);
        console.log('Current question:', this.currentQuestion);
        console.log('Options with correct property:', this.options);
  
        // Fetch next question and options
        this.quizService.getNextQuestion(this.currentQuestionIndex).then((nextQuestion) => {
          if (nextQuestion) {
            console.log('Next question:', nextQuestion);
          } else {
            console.warn('No next question available.');
          }
        }).catch((error) => {
          console.error('Error fetching next question:', error);
        });
  
        this.quizService.getNextOptions(this.currentQuestionIndex).then((nextOptions) => {
          if (nextOptions) {
            // Ensure next options have the `correct` property explicitly set
            const updatedNextOptions = nextOptions.map(option => ({
              ...option,
              correct: option.correct ?? false, // Default `correct` to false if undefined
            }));
            console.log('Next options with correct property:', updatedNextOptions);
          } else {
            console.warn('No next options available.');
          }
        }).catch((error) => {
          console.error('Error fetching next options:', error);
        });
      } else {
        console.warn('No questions available for this quiz.');
        this.currentQuestion = null;
        this.options = [];
      }
    });
  }  

  // Function to load all questions for the current quiz
  private loadQuizQuestionsForCurrentQuiz(): void {
    this.isQuizDataLoaded = false;
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: (questions) => {
        this.questions = questions.map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          })),
        }));
        this.isQuizDataLoaded = true;
        console.log('Loaded questions:', this.questions);
      },
      error: (error) => {
        console.error('Failed to load questions:', error);
        this.isQuizDataLoaded = true;
      }
    });
  }  

  createQuestionData(): void { 
    const createQuestionData = (
      question: QuizQuestion | null,
      options: Option[] | null
    ) => ({
      questionText: question?.questionText ?? null,
      correctAnswersText: null,
      options: Array.isArray(options) // Ensure options is an array before mapping
        ? options.map(option => ({
            ...option,
            correct: option.correct ?? false, // Ensure `correct` property is set
          }))
        : [], // Fallback to an empty array if options is null or not an array
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
          // Ensure options include `correct` property
          return Array.isArray(value) // Ensure value is an array before mapping
            ? value.map(option => ({
                ...option,
                correct: option.correct ?? false, // Default `correct` to false if undefined
              }))
            : []; // Fallback to an empty array if value is not an array
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
                // Ensure options include `correct` property
                return Array.isArray(value) // Ensure value is an array before mapping
                  ? value.map(option => ({
                      ...option,
                      correct: option.correct ?? false, // Default `correct` to false if undefined
                    }))
                  : []; // Fallback to an empty array if value is not an array
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
      this.handleQuestion({
        ...question,
        options: options?.map((option) => ({
          ...option,
          correct: option.correct ?? false
        })),
      });
    } catch (error) {
      console.error('Error fetching question and options:', error);
      return null;
    }
  }  

  getOptions(index: number): Observable<Option[]> {
    return this.quizService.getCurrentOptions(index).pipe(
      catchError(error => {
        console.error('Error fetching options:', error);
        return of([]); // Fallback to an empty array
      })
    );
  }

  getContentAvailability(): Observable<boolean> {
    return combineLatest([
      this.currentQuestion$, // Ensure this is initialized
      this.options$
    ]).pipe(
      map(([question, options]) => !!question && options.length > 0),
      distinctUntilChanged()
    );
  }

  private async isQuestionAnswered(questionIndex: number): Promise<boolean> {
    try {
      const isAnswered$ = this.quizService.isAnswered(questionIndex);
      const isAnswered = await firstValueFrom(isAnswered$);
  
      return isAnswered;
    } catch (error) {
      console.error(`Error determining if question ${questionIndex} is answered:`, error);
      return false;
    }
  }

  private loadAndSetupQuestion(index: number): void {
    this.quizDataService.getQuestionsForQuiz(this.quizId).subscribe({
      next: async (questions: QuizQuestion[]) => {
        if (questions && questions[index]) {
          this.currentQuestion = questions[index];
  
          // Always reset isAnswered to false when a new question loads
          this.isAnswered = false;
  
          // Check if the current question is answered
          const answered = await this.isQuestionAnswered(index);
  
          this.isAnswered = answered;
          console.log(
            `Question at index ${index} is ${answered ? 'already answered' : 'not answered'}.`
          );
  
          this.quizQuestionComponent?.updateSelectionMessageBasedOnState();
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
        filter((question): question is QuizQuestion => question !== null),
        map((question) => ({
          ...question,
          options: question.options.map((option) => ({
            ...option,
            correct: option.correct ?? false,
          })),
        }))
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
    } catch (error) {
      console.error('Error handling new question:', error);
    }
  }

  isLastQuestion(): boolean {
    return this.currentQuestionIndex === this.totalQuestions - 1;
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
        firstValueFrom(this.quizQuestionManagerService.isMultipleAnswerQuestion(question)),
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

  private updateQuizUIForNewQuestion(question: QuizQuestion = this.currentQuestion): void {
    if (!question) {
        console.error('🚨 [updateQuizUIForNewQuestion] Invalid question (null or undefined).');
        return;
    }

    console.log(`🔄 [updateQuizUIForNewQuestion] Looking for question:`, question.questionText);

    if (!this.selectedQuiz || !this.selectedQuiz.questions) {
        console.error('🚨 [updateQuizUIForNewQuestion] selectedQuiz or questions array is missing.');
        return;
    }

    // ✅ Log all quiz questions before searching
    console.log(`📋 [updateQuizUIForNewQuestion] Available questions in selectedQuiz:`, this.selectedQuiz.questions);

    const questionIndex = this.quizService.findQuestionIndex(this.currentQuestion);

    console.log(`🔍 [updateQuizUIForNewQuestion] Found question index:`, questionIndex);

    if (questionIndex < 0 || questionIndex >= this.selectedQuiz.questions.length) {
        console.error('🚨 [updateQuizUIForNewQuestion] Invalid question index:', questionIndex);
        return;
    }

    console.log(`✅ [updateQuizUIForNewQuestion] Updating UI for question index: ${questionIndex}`);

    // Reset UI elements
    this.selectedOption$.next(null);
    // this.explanationTextService.explanationText$.next('');
  }

  async updateQuestionDisplay(questionIndex: number): Promise<void> {
    // Reset `questionTextLoaded` to `false` before loading a new question
    this.questionTextLoaded = false;

    // Ensure questions array is loaded
    while (!Array.isArray(this.questions) || this.questions.length === 0) {
      console.warn('Questions array is not initialized or empty. Loading questions...');
      await this.loadQuizData(); // Ensure questions are loaded
      await new Promise(resolve => setTimeout(resolve, 500)); // small delay before rechecking
    }
  
    if (questionIndex >= 0 && questionIndex < this.questions.length) {
      const selectedQuestion = this.questions[questionIndex];

      this.questionTextLoaded = false; // reset to false before updating

      this.questionToDisplay = selectedQuestion.questionText;
      this.optionsToDisplay = selectedQuestion.options;

      // Set `questionTextLoaded` to `true` once the question and options are set
      this.questionTextLoaded = true;
    } else {
      console.warn(`Invalid question index: ${questionIndex}.`);
    }
  }

  private async updateQuestionStateAndExplanation(questionIndex: number): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);
  
    if (!questionState.selectedOptions) {
      questionState.selectedOptions = [];
    }
  
    const isAnswered = questionState.isAnswered;
    const explanationAlreadyDisplayed = questionState.explanationDisplayed;
  
    // 💡 Only disable if it's a fresh unanswered question AND explanation not yet shown
    const shouldDisableExplanation = !isAnswered && !explanationAlreadyDisplayed;
  
    if (isAnswered || explanationAlreadyDisplayed) {
      this.explanationToDisplay = await firstValueFrom(
        this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex)
      );
  
      this.explanationTextService.setExplanationText(this.explanationToDisplay);
      this.explanationTextService.setShouldDisplayExplanation(true);
      this.showExplanation = true;
    } else if (shouldDisableExplanation) {
      this.explanationToDisplay = '';
      this.explanationTextService.setShouldDisplayExplanation(false);
      this.showExplanation = false;
    }
  
    console.log(`[🛠️ updateQuestionStateAndExplanation] Q${questionIndex}:`, {
      isAnswered,
      explanationAlreadyDisplayed,
      shouldDisableExplanation,
      explanation: this.explanationToDisplay
    });
  }  

  async initializeFirstQuestion(): Promise<void> {
    this.resetQuestionDisplayState();

    try {
      // Load questions for the quiz
      const questions = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(this.quizId));

      if (questions && questions.length > 0) {
        // Set first question data immediately
        this.questions = questions;
        this.currentQuestion = questions[0];
        this.currentQuestionIndex = 0;
        this.questionToDisplay = this.currentQuestion.questionText;

        // Assign optionIds
        this.currentQuestion.options = this.quizService.assignOptionIds(this.currentQuestion.options);
        this.optionsToDisplay = this.currentQuestion.options;

        // Ensure options are fully loaded
        await this.ensureOptionsLoaded();

        // Check for missing optionIds
        const missingOptionIds = this.optionsToDisplay.filter(o => o.optionId === undefined);
        if (missingOptionIds.length > 0) {
          console.error('Options with undefined optionId found:', missingOptionIds);
        } else {
          console.log('All options have valid optionIds.');
        }

        // Force Angular to recognize the new options
        this.cdRef.detectChanges();

        // Apply feedback for the first question after options are fully assigned
        setTimeout(() => {
          //if (this.optionsToDisplay && this.optionsToDisplay.length > 0) {
          //  console.log('[initializeFirstQuestion] ✅ Applying feedback for first question...');
            // this.quizQuestionComponent?.applyOptionFeedbackToAllOptions();
          //} else {
          //  console.warn('[initializeFirstQuestion] ❌ Skipping applyOptionFeedbackToAllOptions because optionsToDisplay is empty.');
          //}
        }, 100);

        // Call checkIfAnswered() to track answered state
        setTimeout(() => {
          this.checkIfAnswered((hasAnswered) => {
            this.handleTimer(hasAnswered);
          });
        }, 150);

        // Ensure UI updates properly
        setTimeout(() => {
          this.cdRef.markForCheck();
        }, 200);
      } else {
        console.warn('No questions available for this quiz.');
        this.handleNoQuestionsAvailable();
      }
    } catch (err) {
      console.error('Error initializing first question:', err);
    }
  }
  
  // Check if an answer has been selected for the first question.
  checkIfAnswered(callback: (result: boolean) => void = () => {}): void {
    // Ensure options are available
    if (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
      console.warn('[checkIfAnswered] Options not available when checking for answer state.');
      callback(false);
      return;
    }
  
    // Validate and normalize options
    this.optionsToDisplay = this.optionsToDisplay.map((option, index) => ({
      ...option,
      optionId: option.optionId ?? index + 1, // Assign a unique ID if missing
    }));
  
    // Log undefined optionIds if any
    const undefinedOptionIds = this.optionsToDisplay.filter((o) => o.optionId === undefined);
    if (undefinedOptionIds.length > 0) {
      console.error('[checkIfAnswered] Options with undefined optionId found:', undefinedOptionIds);
      callback(false); // Abort the check since option structure is invalid
      return;
    }
  
    // Check if at least one option is selected
    const isAnyOptionSelected = this.selectedOptionService.getSelectedOptions().length > 0;
  
    // Validate that all correct options are selected
    this.selectedOptionService
      .areAllCorrectAnswersSelected(this.optionsToDisplay, this.currentQuestionIndex)
      .then((areAllCorrectSelected) => {
        // Log the validation result
        console.log('[checkIfAnswered] Validation Result:', {
          isAnyOptionSelected,
          areAllCorrectSelected,
        });
  
        // Invoke the callback with the combined result
        callback(isAnyOptionSelected || areAllCorrectSelected);
      })
      .catch((error) => {
        console.error('[checkIfAnswered] Error checking if all correct answers are selected:', error);
  
        // Return false in case of an error
        callback(false);
      });
  }

  private handleTimer(hasAnswered: boolean): void {
    // Stop the timer if the question is already answered
    if (hasAnswered && !this.selectedOptionService.stopTimerEmitted) {
      this.timerService.stopTimer();
      this.selectedOptionService.stopTimerEmitted = true;
    }
  
    // Start the timer only after the first question has been set and stabilized
    setTimeout(() => {
      this.timerService.startTimer();
      this.cdRef.markForCheck();
    }, 50); // Wait 50ms to make sure options are rendered
  }

  private async ensureOptionsLoaded(): Promise<void> {
    try {
      while (!this.optionsToDisplay || this.optionsToDisplay.length === 0) {
        console.warn('Waiting for options to load...');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      console.log('Options loaded successfully.');
    } catch (error) {
      console.error('Failed to ensure options were loaded:', error);
    }
  }

  handleNoQuestionsAvailable(): void {
    console.warn('[QuizComponent] ❌ No questions available. Resetting state.', new Error().stack);
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
        this.progressBarService.setProgress(0); // ensure progress is reset on error
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

    // Display explanation after selecting an answer
    this.updateQuestionStateAndExplanation(this.currentQuestionIndex);
  }

  shouldDisplayExplanation(): boolean {
    return this.quizService.shouldExplanationBeDisplayed();
  }

  private async checkIfAnswerSelected(): Promise<void> {
    try {
      const isAnswered = await lastValueFrom(
        this.quizService.isAnswered(this.currentQuestionIndex)
      );
  
      console.log('isAnswered from quizService:', isAnswered);

      // Emit the state to isAnsweredSubject
      this.selectedOptionService.isAnsweredSubject.next(isAnswered);
  
      if (isAnswered) {
        console.log('All correct answers selected. Enabling Next button.');
      } else {
        console.log('Not all correct answers selected yet. Next button disabled.');
      }
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
  public async advanceToNextQuestion(): Promise<void> {
    if (this.isNavigating) {
      console.warn('[🛑] Already navigating – exiting early');
      return;
    }
  
    this.isNavigating = true;
    this.quizStateService.setLoading(true);
    this.quizStateService.setNavigating(true);
  
    try {
      console.log('[advanceToNextQuestion] currentQuestionIndex:', this.currentQuestionIndex);
      const currentIndex = this.quizService.getCurrentQuestionIndex();
      const nextIndex = currentIndex + 1;
      console.log('[advanceToNextQuestion] Calculated nextIndex:', nextIndex);

      if (nextIndex >= this.totalQuestions) {
        console.log('[✅] Last question – navigating to results');
        await this.router.navigate([`${QuizRoutes.RESULTS}${this.quizId}`]);
        return;
      }
  
      const success = await this.navigateToQuestion(nextIndex);
      if (!success) {
        console.warn('[❌] Navigation failed to Q' + nextIndex);
        return;
      }

      this.quizQuestionComponent?.resetExplanation();

      const shouldEnableNextButton = this.isAnyOptionSelected();
      this.updateAndSyncNextButtonState(shouldEnableNextButton);
    } catch (error) {
      console.error('[advanceToNextQuestion] ❌ Error:', error);
    } finally {
      this.isNavigating = false;
      this.quizStateService.setNavigating(false);
      this.quizStateService.setLoading(false);
  
      setTimeout(() => {
        this.selectedOptionService.setAnswered(false);
        this.quizStateService.setAnswered(false);
        this.cdRef.detectChanges();
      }, 200);
    }
  }
  
  async advanceToPreviousQuestion(): Promise<void> {
    const [isLoading, isNavigating, isEnabled] = await Promise.all([
      firstValueFrom(this.quizStateService.isLoading$),
      firstValueFrom(this.quizStateService.isNavigating$),
      firstValueFrom(this.isButtonEnabled$)
    ]);

    // Prevent navigation if any blocking conditions are met
    if (isLoading || isNavigating || !isEnabled) {
      console.warn('Cannot advance - One of the conditions is blocking navigation.');
      return;
    }

    if (this.isNavigating) {
      console.warn('Navigation already in progress. Aborting.');
      return;
    }

    this.isNavigating = true;
    this.quizService.setIsNavigatingToPrevious(true);

    if (this.sharedOptionComponent) {
      console.log('SharedOptionComponent initialized.');
      this.sharedOptionComponent.isNavigatingBackwards = true;
    } else {
      console.info('SharedOptionComponent not initialized, but proceeding with navigation.');
    }  

    try {
      this.resetOptionState();
      this.isOptionSelected = false;

      // const previousQuestionIndex = Math.max(this.currentQuestionIndex - 1, 0);
      
      const currentIndex = this.quizService.getCurrentQuestionIndex();
      const prevIndex = currentIndex - 1;
      this.currentQuestionIndex = prevIndex;

      const success = await this.navigateToQuestion(prevIndex);
      if (!success) {
        console.warn('[❌] Navigation failed to Q' + prevIndex);
        return;
      }

      this.quizQuestionComponent?.resetExplanation();

      // Combine fetching data and initializing question state into a single method
      // await this.prepareQuestionForDisplay(this.currentQuestionIndex);
      // this.resetUI();
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
    if (this.navigatingToResults) {
      console.warn('Navigation to results already in progress.');
      return;
    }
  
    this.navigatingToResults = true; // Prevent multiple clicks
  
    // Reset quiz state
    this.quizService.resetAll();
  
    // Stop the timer and record elapsed time
    if (this.timerService.isTimerRunning) {
      this.timerService.stopTimer((elapsedTime: number) => {
        this.elapsedTimeDisplay = elapsedTime;
        console.log('Elapsed time recorded for results:', elapsedTime);
      });
    } else {
      console.log('Timer was not running, skipping stopTimer.');
    }
  
    // Check if all answers were completed before navigating
    if (!this.quizService.quizCompleted) {
      this.quizService.checkIfAnsweredCorrectly()
        .then(() => {
          console.log('All answers checked, navigating to results...');
          this.quizService.navigateToResults();
        })
        .catch((error) => {
          console.error('Error during checkIfAnsweredCorrectly:', error);
        })
        .finally(() => {
          this.navigatingToResults = false; // Allow navigation again after the process
        });
    } else {
      console.warn('Quiz already marked as completed.');
      this.navigatingToResults = false;
    }
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
  
  // Combined method for preparing question data and UI
  async prepareQuestionForDisplay(questionIndex: number): Promise<void> {
    try {
      // Ensure index is within valid range
      if (questionIndex < 0 || questionIndex >= this.totalQuestions) {
        console.warn('Invalid questionIndex: ${questionIndex}. Aborting.');
        return;
      }
      
      // Execute remaining tasks concurrently
      const processingTasks = [
        this.initializeQuestionForDisplay(questionIndex),
        this.updateQuestionStateAndExplanation(questionIndex),
        this.updateNavigationAndExplanationState()
      ];

      // Execute all tasks
      await Promise.all(processingTasks);
    } catch (error) {
      console.error('Error in prepareQuestionForDisplay():', error);
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

  private updateDisplayState(mode: 'question' | 'explanation', answered: boolean): void {
    console.log('Updating display state in QuizComponent:', { mode, answered });
  
    // Emit the new display state
    this.displayStateSubject.next({ mode, answered });
  
    // Log the current state for debugging
    console.log('Display state emitted:', this.displayStateSubject.value);
  
    // If the question is answered, evaluate the Next button state
    if (answered) {
      console.log('Evaluating Next button state after display state update in QuizComponent.');
      this.evaluateNextButtonState();
    }
  } 

  private async fetchAndSetQuestionData(questionIndex: number): Promise<boolean> {
    console.log(`[Q-TRACE] fetchAndSetQuestionData CALLED with index: ${questionIndex}`);
  
    try {
      if (questionIndex < 0 || questionIndex >= this.totalQuestions) {
        console.warn(`❌ Invalid questionIndex (${questionIndex})`);
        return false;
      }
  
      // 🔄 Reset state
      this.resetQuestionState();
      this.currentQuestion = null;
      this.optionsToDisplay = [];
      this.explanationToDisplay = '';
      this.questionToDisplay = '';
      // this.explanationTextService.setExplanationText('');
      this.cdRef.detectChanges();
  
      await new Promise(res => setTimeout(res, 30)); // Flush UI
  
      // 🧠 Fetch details
      const question = await this.fetchQuestionDetails(questionIndex);
      if (!question) {
        console.error(`❌ No question found at index ${questionIndex}`);
        return false;
      }
      this.quizStateService.setQuestionText(question.questionText ?? 'No question available');
  
      console.log('[Q-DEBUG] FETCHED Q:', questionIndex, {
        text: question.questionText,
        explanation: question.explanation,
        options: question.options.map(o => o.text)
      });
  
      // 🔁 Assign option states
      const updatedOptions = this.quizService.assignOptionActiveStates(question.options, false);
      question.options = updatedOptions;
  
      // 🔍 Determine explanation display
      const isAnswered = await this.isQuestionAnswered(questionIndex);
      const explanationText = isAnswered ? (question.explanation?.trim() ?? '') : '';
  
      // 🧠 Update all explanation-related state in one block
      this.explanationToDisplay = explanationText;
      this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, explanationText);
      this.explanationTextService.setExplanationText(explanationText);
      this.quizStateService.setDisplayState({
        mode: 'explanation',
        answered: true
      });
      console.log('[✅ this.explanationToDisplay]', this.explanationToDisplay);
      console.log(`[🧠 setExplanationText] Q${questionIndex}:`, explanationText);
      
      // Then trigger the UI to switch to explanation display
      this.quizStateService.setDisplayState({ mode: 'explanation', answered: true });
  
      // 🧠 Set question display
      this.questionToDisplay = question.questionText?.trim() ?? 'No question text available';
      this.quizStateService.setQuestionText(this.questionToDisplay);
  
      // 🧠 Set display + internal data
      this.setQuestionDetails(this.questionToDisplay, updatedOptions, explanationText);
      this.currentQuestion = { ...question, options: updatedOptions };
      this.optionsToDisplay = [...updatedOptions];
      this.currentQuestionIndex = questionIndex;
  
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService.setCurrentQuestionIndex(questionIndex);
      this.quizStateService.updateCurrentQuestion(this.currentQuestion);
  
      this.cdRef.detectChanges();
  
      await this.quizService.checkIfAnsweredCorrectly();
      this.timerService.startTimer(this.timerService.timePerQuestion);
  
      console.log('[Q-DEBUG] STATE AFTER SET', {
        questionText: this.questionToDisplay,
        explanationText: this.explanationToDisplay,
        currentQuestionIndex: this.currentQuestionIndex
      });
  
      return true;
    } catch (error) {
      console.error(`[fetchAndSetQuestionData] ❌ Error loading Q${questionIndex}:`, error);
      return false;
    }
  }  

  private async fetchQuestionDetails(questionIndex: number): Promise<QuizQuestion> {
    console.log(`[Q-TRACE] fetchQuestionDetails FETCHING Q${questionIndex}`);

    try {
      // Fetch the question text
      const questionTextObservable = this.quizService.getQuestionTextForIndex(questionIndex);
      const questionText = await firstValueFrom(questionTextObservable);
      console.log(`[fetchQuestionDetails] Q${questionIndex} text:`, questionText);
  
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

      console.log(`[✅ fetchQuestionDetails RESULT Q${questionIndex}]`, {
        questionText,
        explanation,
        optionsLength: options.length
      });
  
      if (!explanation) {
        console.warn('No explanation text found for question at index:', questionIndex);
      }
  
      // Determine the question type
      const type = options.length > 1 ? QuestionType.MultipleAnswer : QuestionType.SingleAnswer;
  
      // Create the QuizQuestion object
      const question: QuizQuestion = { questionText, options, explanation, type };
  
      // Set the question type in the quiz data service
      this.quizDataService.setQuestionType(question);

      console.log(`[fetchAndSetQuestionData] ✅ Loaded Q${questionIndex}`, {
        questionText: this.questionToDisplay,
        explanation: this.explanationToDisplay,
        optionsCount: this.optionsToDisplay.length,
      });
  
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
    this.questionToDisplay = questionText || 'No question text available';
    this.optionsToDisplay = Array.isArray(options) ? options : [];
    this.explanationToDisplay = explanationText || 'No explanation available';

    this.questionTextSubject.next(this.questionToDisplay);
    this.explanationTextSubject.next(this.explanationToDisplay);
  }

  private async resetUIAndNavigate(questionIndex: number): Promise<void> {
    try {
      // Validate badge and route consistency
      const currentBadgeNumber = this.quizService.getCurrentBadgeNumber();
      if (currentBadgeNumber !== questionIndex + 1) {
        console.warn('Badge number (${currentBadgeNumber}) does not match target question index (${questionIndex}). Correcting...');
      }
  
      // Reset UI and explanation text before navigating
      this.resetUI();
      this.explanationTextService.resetStateBetweenQuestions();
  
      // Fully clear previous question’s options
      this.optionsToDisplay = [];
      this.currentQuestion = null;
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error during resetUIAndNavigate():', error);
    }
  }  
  
  private async navigateToQuestion(questionIndex: number): Promise<boolean> {
    console.log(`[navigateToQuestion] 🏁 Navigating to Q${questionIndex}`);
  
    if (questionIndex < 0 || questionIndex >= this.totalQuestions) {
      console.warn(`[navigateToQuestion] ❌ Invalid index: ${questionIndex}`);
      return false;
    }
  
    const routeUrl = `/question/${this.quizId}/${questionIndex + 1}`;
    console.log(`[navigateToQuestion] 🧭 Navigating to route: ${routeUrl}`);
    const navSuccess = await this.router.navigateByUrl(routeUrl);
  
    if (!navSuccess) {
      console.warn(`[navigateToQuestion] ❌ Navigation to ${routeUrl} failed`);
      return false;
    }
  
    const success = await this.fetchAndSetQuestionData(questionIndex);
    if (!success) {
      console.warn(`[navigateToQuestion] ❌ Failed to fetch question data`);
      return false;
    }

    // Only now update the index
    this.currentQuestionIndex = questionIndex;
    this.quizService.setCurrentQuestionIndex(questionIndex);
  
    this.quizService.updateBadgeText(questionIndex + 1, this.totalQuestions);
    localStorage.setItem('savedQuestionIndex', JSON.stringify(questionIndex));
    this.cdRef.detectChanges();
  
    return true;
  }

  // Reset UI immediately before navigating
  private resetUI(): void {
    // Reset the current question and options
    this.question = null;
    this.optionsToDisplay = [];
  
    // Reset the quiz question component if it exists
    if (this.quizQuestionComponent) {
      this.quizQuestionComponent.resetFeedback();
      this.quizQuestionComponent.resetState();
    }
  
    // Reset the quiz service state
    this.quizService.resetAll();
  
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

  /* restartQuiz(): void {
    // Reset quiz-related services and states
    this.resetQuizState();
  
    // Stop the timer before restarting
    this.timerService.stopTimer;
  
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
              // Reset the state in QuizQuestionComponent
              await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();
  
              // Load the first question and its options
              const firstQuestion = this.questions[0];
              if (firstQuestion) {
                this.quizQuestionComponent.loadOptionsForQuestion(firstQuestion);
              } else {
                console.error('First question not found during quiz restart.');
              }
  
              // Load dynamic component if necessary
              this.quizQuestionComponent.loadDynamicComponent();
            } else {
              console.error('QuizQuestionComponent not available.');
            }
  
            // Ensure UI reflects the first question properly
            this.resetUI();
            this.resetOptionState();
            this.initializeFirstQuestion();
  
            // Update badge text after reset
            this.quizService.updateBadgeText(1, this.totalQuestions);
  
            // Start the timer for the first question
            this.timerService.startTimer(this.timerService.timePerQuestion);
            console.log('[QuizComponent] Timer started for new quiz.');
          } catch (error) {
            console.error('Error fetching and displaying the first question:', error);
          }
        }, 50); // Adjust the timeout duration if necessary
      })
      .catch((error) => {
        console.error('Error during quiz restart:', error);
      });
  } */
  /* restartQuiz(): void {
    this.resetQuizState();
  
    // Always stop timer cleanly
    this.timerService.stopTimer?.();
  
    // Force sync to first question
    this.quizService.setCurrentQuestionIndex(0);
  
    // Navigate to question 1
    this.router.navigate(['/question', this.quizId, 1]).then(() => {
      setTimeout(async () => {
        try {
          // 🔒 Sync state before reloading content
          this.currentQuestionIndex = 0;
  
          if (this.quizQuestionComponent) {
            await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();
  
            const firstQuestion = this.questions[0];
            if (firstQuestion) {
              this.quizQuestionComponent.loadOptionsForQuestion(firstQuestion);
              this.quizQuestionComponent.loadDynamicComponent();
            } else {
              console.error('First question not found during quiz restart.');
            }
          } else {
            console.warn('QuizQuestionComponent not available yet.');
          }
  
          // 🧼 Reset visual/UI state
          this.resetUI();
          this.resetOptionState();
          this.initializeFirstQuestion();
  
          // 🎯 Force index sync after view init
          this.quizService.setCurrentQuestionIndex(0);
  
          // Update badge for Q1
          this.quizService.updateBadgeText(1, this.totalQuestions);
  
          // ⏱️ Start timer again
          this.timerService.startTimer(this.timerService.timePerQuestion);
          console.log('[QuizComponent] Timer started for new quiz.');
        } catch (error) {
          console.error('Error fetching and displaying the first question:', error);
        }
      }, 50);
    }).catch((error) => {
      console.error('Error during quiz restart:', error);
    });
  } */
  /* restartQuiz(): void {
    this.resetQuizState(); // ✅ clears explanation, feedback, UI, timer, state
  
    // ⏹ Stop timer
    this.timerService.stopTimer?.();
  
    // Force current index to 0
    this.quizService.setCurrentQuestionIndex(0);
    this.currentQuestionIndex = 0;
  
    this.router.navigate(['/question', this.quizId, 1]).then(() => {
      setTimeout(async () => {
        try {
          // ✅ Wait until QuizQuestionComponent is ready
          if (this.quizQuestionComponent) {
            await this.quizQuestionComponent.resetQuestionStateBeforeNavigation(); // 🧼 clears feedback/icons/messages
  
            const firstQuestion = this.questions[0];
            if (firstQuestion) {
              this.quizQuestionComponent.loadOptionsForQuestion(firstQuestion);
              this.quizQuestionComponent.loadDynamicComponent();
            } else {
              console.error('❌ First question not found.');
            }
          } else {
            console.warn('⚠️ QuizQuestionComponent not yet available.');
          }
  
          // 🧼 Reset visual/UI state
          this.resetUI();
          this.resetOptionState();
          this.initializeFirstQuestion();
  
          // Ensure synced index
          this.quizService.setCurrentQuestionIndex(0);
  
          // 🔁 Clear and then fetch explanation
          this.explanationTextService.resetExplanationText();
          await this.quizQuestionComponent?.updateExplanationText(0);
  
          // ✅ Wait until explanation is actually available
          await firstValueFrom(
            this.explanationTextService.formattedExplanation$.pipe(
              filter(text => !!text?.trim()),
              take(1)
            )
          );
  
          // ✅ Now allow it to show
          this.explanationTextService.setShouldDisplayExplanation(true);
          this.explanationTextService.triggerExplanationEvaluation();
  
          // 🎯 Update badge
          this.quizService.updateBadgeText(1, this.totalQuestions);
  
          // ⏱ Start timer again
          this.timerService.startTimer(this.timerService.timePerQuestion);
          console.log('[QuizComponent] ✅ Timer started for restarted quiz');
        } catch (error) {
          console.error('❌ Error restarting quiz:', error);
        }
      }, 50);
    }).catch((error) => {
      console.error('❌ Navigation error on restart:', error);
    });
  } */
  restartQuiz(): void {
    this.resetQuizState();
  
    // ✅ ACTUALLY stop the timer (you were referencing the method)
    this.timerService.stopTimer();
  
    // Reset internal index
    this.currentQuestionIndex = 0;
    this.quizService.setCurrentQuestionIndex(0);
  
    // Navigate to Q1
    this.router.navigate(['/question', this.quizId, 1]).then(() => {
      // Wait for navigation + component render
      setTimeout(async () => {
        try {
          // ✅ Reset child component state
          if (this.quizQuestionComponent) {
            await this.quizQuestionComponent.resetQuestionStateBeforeNavigation();
  
            const firstQuestion = this.questions[0];
            if (firstQuestion) {
              this.quizQuestionComponent.loadOptionsForQuestion(firstQuestion);
              this.quizQuestionComponent.loadDynamicComponent();
            }
          }
  
          // ✅ Reset UI
          this.resetUI();
          this.resetOptionState();
          this.initializeFirstQuestion();
  
          // ✅ Update badge
          this.quizService.updateBadgeText(1, this.totalQuestions);
  
          // ✅ Reset explanation state
          this.explanationTextService.resetExplanationText();
          this.explanationTextService.setShouldDisplayExplanation(false);
  
          // ⏳ WAIT FOR view + child render
          setTimeout(async () => {
            // ✅ Fetch explanation after view is ready
            await this.quizQuestionComponent?.updateExplanationText(0);
  
            // ✅ Wait until explanation actually emits
            await firstValueFrom(
              this.explanationTextService.formattedExplanation$.pipe(
                filter((text) => !!text?.trim()),
                take(1)
              )
            );
  
            // ✅ Now allow it to display
            this.explanationTextService.setShouldDisplayExplanation(true);
            this.explanationTextService.triggerExplanationEvaluation();
  
            // ✅ START timer (after everything's displayed)
            this.timerService.startTimer(this.timerService.timePerQuestion);
            console.log('[QuizComponent] ✅ Timer restarted after quiz reset.');
  
          }, 100); // 👈 this delay ensures explanation DOM + logic settle
  
        } catch (error) {
          console.error('❌ Error restarting quiz:', error);
        }
      }, 50); // 👈 slight delay for navigation to settle
    });
  }
  
  private resetQuizState(): void {
    console.log('[resetQuizState] 🔄 Resetting quiz state...');

    // Stop the timer when resetting quiz state
    if (this.timerService.isTimerRunning) {
        console.log('[resetQuizState] ⏹ Stopping timer...');
        this.timerService.stopTimer();
        this.timerService.isTimerRunning = false;
    }

    // Reset all quiz-related services
    this.quizService.resetAll();
    this.quizStateService.createDefaultQuestionState();
    this.quizStateService.clearSelectedOptions();
    this.selectionMessageService.resetMessage();
    
    // ❌ FULL reset of explanation stream and state
    // this.explanationTextService.updateFormattedExplanation('');
    this.explanationTextService.resetExplanationText();
    this.explanationTextService.setIsExplanationTextDisplayed(false);
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.explanationTextService.triggerExplanationEvaluation();

    // Trigger resets in state management services
    this.resetStateService.triggerResetFeedback();
    this.resetStateService.triggerResetState();

    // Reset UI-related states
    this.currentQuestionIndex = 0;
    this.progressPercentage.next(0);
    this.score = 0;

    // Ensure timer resets when quiz state resets
    console.log('[resetQuizState] 🔄 Resetting timer to 30 seconds...');
    this.timerService.resetTimer();

    // Clear any lingering UI state
    this.questionToDisplay = '';
    this.optionsToDisplay = [];
    this.explanationToDisplay = '';

    // Force UI update
    this.cdRef.detectChanges();
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