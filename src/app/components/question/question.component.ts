import { ChangeDetectionStrategy, ChangeDetectorRef, Component,
  EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit,
  Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, ReplaySubject, Subject, Subscription } from 'rxjs';
import { catchError, filter, first, map, skipWhile, take, takeUntil, tap } from 'rxjs/operators';

import { Utils } from '../../shared/utils/utils';
import { AudioItem } from '../../shared/models/AudioItem.model';
import { FormattedExplanation } from '../../shared/models/FormattedExplanation.model';
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
  @Output() isAnswered = false;
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
  @Input() selectionMessage: string;
  @Input() showFeedback = false;

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
  private initialized = false;

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
  }

  async ngOnInit(): Promise<void> {
    this.logInitialData();
    this.initializeQuizQuestion();
    this.subscribeToRouterEvents();

    if (!this.initialized) {
      await this.initializeQuiz();
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.ngZone.run(() => {
          this.loadQuizQuestions();
        });
      }
    });

    this.subscribeToAnswers();
    this.subscriptionToOptions();
    // this.quizService.initializeSounds();
    this.logFinalData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      this.getCorrectAnswers();
      this.correctMessage = this.quizService.setCorrectMessage(
        this.quizService.correctAnswerOptions,
        this.data.options
      );
      this.cdRef.detectChanges();
    }

    if (changes.quizId || changes.questionIndex) {
      if (this.quizId && this.questionIndex != null) {
        this.loadQuiz(this.quizId, this.questionIndex);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
    document.removeEventListener(
      'visibilitychange',
      this.initializeQuestionOptions.bind(this)
    );
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

  private async initializeQuiz(): Promise<void> {
    this.initialized = true;
    this.subscribeToActivatedRouteParams();
    this.initializeSelectedQuiz();
    this.initializeSelectedOption();
    this.initializeQuestionOptions();
    
    try {
      await this.loadQuizQuestions();
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

  private subscribeToActivatedRouteParams(): void {
    this.activatedRoute.paramMap.pipe(first()).subscribe((params: ParamMap) => {
      const quizId = params.get('quizId');
      const indexParam = params.get('questionIndex');
      const questionIndex = parseInt(indexParam, 10);
  
      if (quizId && !isNaN(questionIndex)) {
        this.loadQuiz(quizId, questionIndex);
      } else {
        console.error('Invalid parameters:', `quizId=${quizId}`, `questionIndex=${indexParam}`);
      }
    });
  }
  
  private loadQuiz(quizId: string, questionIndex: number): void {
    this.quizDataService.getQuizById(quizId).subscribe({
      next: (quiz) => {
        if (quiz && quiz.questions && quiz.questions.length > questionIndex) {
          this.currentQuestion = quiz.questions[questionIndex];
        } else {
          console.error('No valid question or options found for index:', questionIndex);
        }
      },
      error: (error) => {
        console.error('Error loading quiz data:', error);
      }
    });
  }

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
      this.setExplanationText(this.currentQuestionIndex);
    }
  }

  public getDisplayOptions(): Option[] {
    return this.optionsToDisplay && this.optionsToDisplay.length > 0
      ? this.optionsToDisplay : this.data?.options;
  }

  private logInitialData(): void {
    console.log('this.questionData:', this.questionData);
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

  private subscribeToRouterEvents(): void {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.destroy$.next();
        this.destroy$.complete();
      });
  }

  private initializeSelectedQuiz(): void {
    if (this.quizDataService.selectedQuiz$) {
      this.quizDataService.selectedQuiz$.subscribe((quiz: Quiz) => {
        this.selectedQuiz.next(quiz);
        this.setQuestionOptions();
      });
    }
  }

  private initializeSelectedOption(): void {
    of(this.selectedOption)
      .pipe(tap((option: Option) => this.selectedOption$.next(option)))
      .subscribe();
  }

  private initializeQuestionOptions(): void {
    this.options = this.getOptionsForQuestion();
    this.selectedOption = this.question ? this.getSelectedOption() : undefined;
  }

  private async loadQuizQuestions(): Promise<void> {
    this.isLoading = true;

    try {
      const questions = await this.quizService.fetchQuizQuestions();

      if (questions && questions.length > 0) {
        this.questions = of(questions);

        // Update component's state with the fetched questions
        // Display explanation texts for previously answered questions
        questions.forEach((question, index) => {
          const state = this.quizStateService.getQuestionState(
            this.quizId,
            index
          );
          if (state?.isAnswered) {
            const formattedExplanationText: FormattedExplanation = {
              questionIndex: index,
              explanation:
                this.explanationTextService.getFormattedExplanationTextForQuestion(
                  index
                )
            };
            this.explanationTextService.formattedExplanations[index] =
              formattedExplanationText;
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

  private subscribeToCorrectAnswersAndData(): void {
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
            options: data.currentOptions,
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
              isNavigatingToPrevious: this.isNavigatingToPrevious,
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

          this.fetchCorrectAnswersAndText(this.data, this.data.options);

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
  }

  private subscriptionToOptions(): void {
    this.quizService.currentOptions$.subscribe((options) => {
      if (options) {
        this.options = options;
      }
    });
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
    // Fetch the correct answers if they are not already available
    const currentCorrectAnswers = this.quizService.correctAnswers.get(
      data.questionText
    );
    if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
      await this.quizService.setCorrectAnswers(
        this.currentQuestion,
        data.currentOptions
      );
    } else {
      this.correctAnswers = currentCorrectAnswers;
    }

    // Fetch the correct answers text or update it with the correct message
    await this.fetchCorrectAnswersText(data, data.currentOptions);
    console.log('After fetchCorrectAnswersText...');
    console.log('MY CORR MSG:', this.correctMessage);
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

  private getSelectedOption(): Option | null {
    const option = this.selectedOptions.find(
      (option: Option): option is Option => {
        return (
          option.hasOwnProperty('correct') && option.hasOwnProperty('text')
        );
      }
    ) as Option | undefined;
    return option ?? null;
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
    this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
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
    data.isMultipleAnswer =
      firstValueFrom(of(await this.quizStateService.isMultipleAnswerQuestion(this.question)));
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

  async onOptionClicked(option: Option, index: number): Promise<void> {
    this.quizService.addSelectedOption(option);

    try {
      const currentQuestion = await this.getCurrentQuestion();
      if (!currentQuestion) {
        console.error('Could not retrieve the current question.');
        return;
      }

      this.handleOptionSelection(option, index, currentQuestion);
      await this.processCurrentQuestion(currentQuestion);
      this.questionAnswered.emit();

      this.updateQuestionStateForExplanation(this.currentQuestionIndex);

      // Determine correctness after processing the question to ensure up-to-date state
      const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
      this.handleAudioPlayback(isCorrect);
    } catch (error) {
      console.error('An error occurred while processing the option click:', error);
    }
  }

  private async processCurrentQuestion(
    currentQuestion: QuizQuestion
  ): Promise<void> {
    this.explanationTextService.setShouldDisplayExplanation(true);

    const explanationText =
      await this.explanationTextService.getFormattedExplanationTextForQuestion(
        this.currentQuestionIndex
      );
    this.explanationTextService.setCurrentQuestionExplanation(explanationText);

    const totalCorrectAnswers = this.getTotalCorrectAnswers(currentQuestion);
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

  /* handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
      this.playCorrectSound = true;
      setTimeout(() => this.playCorrectSound = false, 1000); // Reset the flag after playback
    } else {
      this.playIncorrectSound = true;
      setTimeout(() => this.playIncorrectSound = false, 1000); // Reset the flag after playback
    }
  } */

  /* handleAudioPlayback(isCorrect: boolean): void {
    const audioSrc = isCorrect ? this.correctAudioSource : this.incorrectAudioSource;
    let audio = new Audio(audioSrc);
    audio.play().then(() => {
      console.log("Audio started playing!");
    }).catch(error => {
      console.error("Error playing audio:", error);
      // Handle specific errors, e.g., User didn't interact with the document first.
    });
  } */

  /* handleAudioPlayback(isCorrect: boolean): void {
    const audioSrc = isCorrect ? this.correctAudioSource : this.incorrectAudioSource;
    let audio = new Audio(audioSrc);

    audio.oncanplaythrough = () => {
        console.log("Audio is ready and can play through without interruption.");
        audio.play().catch(error => {
            console.error("Error while trying to play audio:", error);
        });
    };

    audio.onerror = () => {
        console.error("Error loading audio source:", audio.error);
        // Log specific error details if available
        if (audio.error) {
            console.log(`Media error code: ${audio.error.code}`);
            switch (audio.error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    console.error("Audio loading aborted.");
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    console.error("Audio loading failed due to a network error.");
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    console.error("Audio decoding failed due to a corrupted data or unsupported feature.");
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    console.error("Audio format not supported or source not found.");
                    break;
                default:
                    console.error("An unknown error occurred.");
                    break;
            }
        }
    };

    audio.load();  // Explicitly call load if needed, though setting src usually suffices.
  } */

  /* handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
        this.playCorrectSound = true;
        this.cdRef.detectChanges(); // Force update to the view
        setTimeout(() => {
            this.playCorrectSound = false;
            this.cdRef.detectChanges(); // Update the view after stopping the sound
        }, 1000);
    } else {
        this.playIncorrectSound = true;
        this.cdRef.detectChanges();
        setTimeout(() => {
            this.playIncorrectSound = false;
            this.cdRef.detectChanges();
        }, 1000);
    }
  } */

  /* handleAudioPlayback(isCorrect: boolean): void {
    if (isCorrect) {
      this.audioList.push(this.correctAudioSource);
    } else {
      this.audioList.push(this.incorrectAudioSource);
    }

    // Reset the audio list after playback
    setTimeout(() => this.audioList = [], 1000);
  } */

  /* handleAudioPlayback(isCorrect: boolean): void {
    this.audioList = isCorrect ? [this.correctAudioSource] : [this.incorrectAudioSource];

    // Reset the audio list after playback to ensure the component refreshes
    setTimeout(() => {
        this.audioList = [];
    }, 1000); // Adjust this time based on the length of audio
  } */

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

  private getTotalCorrectAnswers(currentQuestion: QuizQuestion): number {
    return currentQuestion.options.filter((option) => option.correct).length;
  }

  async getCurrentQuestion(): Promise<QuizQuestion | null> {
    try {
      const currentQuestion = await firstValueFrom(
        this.quizStateService.currentQuestion$.pipe(
          skipWhile(question => question === null || !this.quizService.isQuizQuestion(question)), // Skip null and malformed data
          take(1)
        )
      ) as QuizQuestion | null;
      return currentQuestion;
    } catch (error) {
      console.error('Error fetching current question:', error);
      return null;
    }
  }

  async handleOptionSelection(
    option: Option,
    index: number,
    currentQuestion: QuizQuestion
  ): Promise<void> {
    this.processOptionSelection(currentQuestion, option);
    this.updateAnswersForOption(option);
    this.checkAndHandleCorrectAnswer();
    this.logDebugInformation();

    const totalCorrectAnswers = this.getTotalCorrectAnswers(currentQuestion);
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
    option: Option
  ): void {
    this.handleOptionClicked(currentQuestion, option);

    // Check if the clicked option is selected
    const isOptionSelected = this.isSelectedOption(option);

    // Set shouldDisplayExplanation to true when an option is selected, otherwise set it to false
    this.explanationTextService.setShouldDisplayExplanation(isOptionSelected);
    this.explanationTextService.toggleExplanationDisplay(isOptionSelected);
  }

  private updateAnswersForOption(selectedOption: Option): void {
    // Check if the selected option is already in the answers array
    const isOptionSelected = this.answers.some(
      (answer) => answer.id === selectedOption.optionId
    );

    // If the option is not already selected, add it to the answers array
    if (!isOptionSelected) {
      this.answers.push(selectedOption);
    }

    // Emit the updated answers array
    this.quizService.answersSubject.next(this.answers);
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
      });
  }

  handleOptionClicked(currentQuestion: QuizQuestion, option: Option): void {
    const isOptionSelected = this.checkOptionSelected(option);
    const index = this.selectedOptions.findIndex((opt) => opt === option);

    if (!isOptionSelected && index === -1) {
      this.addSelectedOption(option, currentQuestion);
    } else {
      if (index !== -1) {
        this.removeSelectedOption(index);
      }
      this.unselectOption();
    }

    this.handleMultipleAnswer(currentQuestion);
  }

  private addSelectedOption(
    option: Option,
    currentQuestion: QuizQuestion
  ): void {
    this.selectedOptions.push(option);
    console.log('After Click - selectedOptions:', this.selectedOptions);
    this.selectOption(currentQuestion, option);
  }

  private removeSelectedOption(index: number): void {
    this.selectedOptions.splice(index, 1);
    console.log('Option is already selected or clicked to unselect.');
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
        if (questionIndex === -1) {
          console.error('Current question not found in questions array.');
          this.isLoadingQuestions = false;
          return;
        }

        this.setExplanationText(questionIndex);
        this.isLoadingQuestions = false;
      },
      error: (error: Error) => {
        console.error('Error fetching questions array:', error);
        this.isLoadingQuestions = false;
      },
    });
  }

  checkOptionSelected(option: Option): boolean {
    return this.selectedOptions.includes(option as Option);
  }

  selectOption(currentQuestion: QuizQuestion, option: Option): void {
    this.selectedOptions = [option];
    this.showFeedbackForOption = { [option.optionId]: true };
    this.showFeedback = true;
    this.selectedOption = option;

    // After answering, check if it's the last question
    this.handleLastQuestionAnsweredMessage();

    // Update the selected option in the quiz service and mark the question as answered
    this.quizService.updateSelectedOptions(
      this.quizService.quizId,
      this.currentQuestionIndex,
      option.optionId
    );

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
    this.selectionMessageService.updateSelectionMessage(
      'Please select an option to continue...'
    );
    this.quizQuestionManagerService.setExplanationText(null);
  }

  handleLastQuestionAnsweredMessage(): void {
    this.quizService.getTotalQuestions().subscribe({
      next: (totalQuestions) => {
        if (this.currentQuestionIndex === totalQuestions - 1) {
          if (this.quizService.isAnswered(this.currentQuestionIndex)) {
            this.selectionMessageService.updateSelectionMessage(
              'Please click the Show Results button'
            );
          } else {
            this.selectionMessageService.updateSelectionMessage(
              'Please select an option to continue...'
            );
          }
        } else {
          this.selectionMessageService.updateSelectionMessage(
            'Please click the next button to continue...'
          );
        }
      },
      error: (error) =>
        console.error('Failed to fetch total questions:', error),
    });
  }

  async setExplanationText(questionIndex: number): Promise<void> {
    this.initializeExplanationTextDisplay();

    if (document.hidden) {
      return;
    }

    const questionData = await this.quizService.getNextQuestion(
      this.currentQuestionIndex
    );
    if (this.isValidQuestionData(questionData)) {
      await this.processExplanationText(questionData, questionIndex);
    } else {
      console.error('Error: questionData or explanation is undefined');
    }
  }

  private initializeExplanationTextDisplay(): void {
    this.isExplanationTextDisplayed = true;
    this.explanationTextService.setIsExplanationTextDisplayed(true);
  }

  private isValidQuestionData(questionData: QuizQuestion): boolean {
    return !!questionData && !!questionData.explanation;
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

  isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
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