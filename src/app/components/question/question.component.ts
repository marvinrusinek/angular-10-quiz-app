import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  Observable,
  of,
  ReplaySubject,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  filter,
  map,
  switchMap,
  take,
  takeUntil,
  tap,
  throwError
} from 'rxjs/operators';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionComponent implements OnInit, OnChanges, OnDestroy {
  @Output() answer = new EventEmitter<number>();
  @Output() answersChange = new EventEmitter<string[]>();
  @Output() selectionChanged: EventEmitter<{
    question: QuizQuestion;
    selectedOptions: Option[];
  }> = new EventEmitter();
  @Output() shouldDisplayNumberOfCorrectAnswersChanged: EventEmitter<{
    shouldDisplay: boolean;
    numberOfCorrectAnswers: number;
  }> = new EventEmitter();
  @Output() toggleVisibility: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionClicked: EventEmitter<void> = new EventEmitter<void>();
  @Output() optionSelected: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() isAnswerSelectedChange: EventEmitter<boolean> =
    new EventEmitter<boolean>();
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
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: Observable<QuizQuestion[]>;
  @Input() options: Option[];
  @Input() optionsToDisplay: Option[];
  @Input() currentQuestion: QuizQuestion;
  @Input() currentQuestion$: Observable<QuizQuestion | null> = of(null);
  @Input() currentQuestionIndex = 0;
  @Input() previousQuestionIndex: number;
  @Input() quizId: string | null | undefined = '';
  @Input() multipleAnswer: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  @Input() shouldDisplayNumberOfCorrectAnswers = false;
  @Input() explanationText: string | null;
  @Input() explanationTextValue: string;
  @Input() isOptionSelected = false;
  @Input() selectionMessage: string;
  @Input() showFeedback = false;

  combinedQuestionData$: Subject<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> = new Subject();

  isMultipleAnswer$: Observable<boolean>;
  questions$: Observable<QuizQuestion[]> = new Observable<QuizQuestion[]>();
  selectedOption: Option | null = null;
  selectedOptions: Option[] = [];
  selectedOption$ = new BehaviorSubject<Option>(null);
  options$: Observable<Option[]>;
  quiz: Quiz;
  questionsObservableSubscription: Subscription;
  currentQuestionSubscription: Subscription;
  currentQuestionSource: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
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
  displayExplanation = false;
  isChangeDetected = false;
  feedbackDisplayed = false;
  showFeedbackForOption: { [optionId: number]: boolean } = {};
  selectionMessage$: Observable<string>;
  correctAnswersLoaded = false;
  questionDataSubscription: Subscription;
  isExplanationTextDisplayed = false;

  isNavigatingToPrevious = false;

  private initialized = false;
  private destroy$: Subject<void> = new Subject<void>();

  multipleAnswerSubscription: Subscription;
  sharedVisibilitySubscription: Subscription;

  isPaused = false;
  isLoading = true;

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
    protected router: Router
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
      selectedOption: [''],
    });

    this.sharedVisibilitySubscription =
      this.sharedVisibilityService.pageVisibility$.subscribe((isHidden) => {
        this.handlePageVisibilityChange(isHidden);
      });
    
    this.quizService.getIsNavigatingToPrevious().subscribe(
      isNavigating => this.isNavigatingToPrevious = isNavigating
    );
  }

  async ngOnInit(): Promise<void> {
    this.options = this.getOptionsForQuestion();
    this.selectedOption = this.question ? this.getSelectedOption() : undefined;
  
    this.logInitialData();
    this.initializeQuizQuestion();
    this.subscribeToRouterEvents();
  
    if (!this.initialized) {
      await this.initializeQuiz();
    }
  
    this.subscribeToAnswers();
    this.subscribeToSelectionMessage();
    this.subscriptionToOptions();
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.questionsObservableSubscription?.unsubscribe();
    this.currentQuestionSubscription?.unsubscribe();
    this.multipleAnswerSubscription?.unsubscribe();
    this.sharedVisibilitySubscription?.unsubscribe();
  }

  trackByFn(option: Option) {
    return option.optionId;
  }
  
  private async initializeQuiz(): Promise<void> {
    this.initialized = true;
    this.initializeSelectedQuiz();
    this.initializeSelectedOption();
    this.subscribeToActivatedRouteParams();
  
    try {
      await this.loadQuizQuestions();
      this.subscribeToCorrectAnswersAndData();
      await this.quizDataService.asyncOperationToSetQuestion(this.quizId, this.currentQuestionIndex);
      // this.initializeCorrectAnswerOptions();
      // this.subscribeToCorrectAnswers();
    } catch (error) {
      console.error('Error getting current question:', error);
    }
  }
  
  private subscribeToActivatedRouteParams(): void {
    this.activatedRoute.params.subscribe(params => {
      this.quizId = params['quizId'];
    });
  }
  
  private subscribeToAnswers(): void {
    this.quizService.answers$.subscribe(answers => {
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

  getDisplayOptions(): Option[] {
    return this.optionsToDisplay && this.optionsToDisplay.length > 0
      ? this.optionsToDisplay
      : this.data?.options;
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

  private async loadQuizQuestions(): Promise<void> {
    this.isLoading = true;
    try {
      // await this.quizService.fetchQuizQuestions();
      const questions = await this.quizService.fetchQuizQuestions() || [];
      console.log("Q's", questions);

      if (questions && questions.length > 0) {
        this.options = questions[0].options;
      } else {
        console.error('No questions returned from the service');
      }
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /* private async loadQuizQuestions(): Promise<void> {
    this.isLoading = true;
    try {
      // Simulate fetching questions with a delay
      const questions = await this.quizService.fetchQuizQuestions();
      // Assuming the first question's options are what you want to display
      this.options = questions[0].options;
      
      // Introduce a slight delay before setting isLoading to false
      setTimeout(() => {
        this.isLoading = false;
      }, 300); // Adjust the delay as needed, 300ms is just an example
    } catch (error) {
      console.error('Error loading questions:', error);
      this.isLoading = false; // Ensure isLoading is set to false even on error
    }
  } */
  
  

  /* private initializeCorrectAnswerOptions(): void {
    this.quizService.setCorrectAnswerOptions(this.correctAnswers);
  } */

  private subscribeToCorrectAnswersAndData(): void {
    this.quizService.combinedQuestionData$.subscribe(value => {
      console.log('CQD::', value);
    });
    
    combineLatest([
      this.quizService.correctAnswers$,
      this.quizService.combinedQuestionData$.pipe(filter(data => data !== null))
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

          this.fetchCorrectAnswersAndText(this.data, this.data.options);
          
          if (this.currentOptions && this.correctAnswers) {
            const correctAnswerOptions: Option[] = this.correctAnswers.map(answerId =>
              this.currentOptions.find(option => option.optionId === answerId)
            ).filter(option => option !== undefined) as Option[];
          
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

  private subscribeToSelectionMessage(): void {
    this.selectionMessageService.selectionMessage$.subscribe(
      (message: string) => {
        this.selectionMessage = message;
      }
    );
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
    console.log('data:::', this.data);
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

  shouldDisplayOptions(): boolean {
    return this.data?.options && this.data.options.length > 0;
  }

  shouldHideOptions(): boolean {
    return !this.isLoading && (!this.data?.options || this.data.options.length === 0);
  }
  
  shouldDisplayTextContent(): boolean {
    return !!this.data?.questionText || !!this.data?.correctAnswersText;
  }

  shouldDisplayPreviousQuestionOptions(): boolean {
    // Check if the current question is not the first question
    return this.currentQuestionIndex !== 0;
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

  // not being called, potentially remove, but might need for getting correct answers text to display
  private loadQuestionsForQuiz(quizId: string): void {
    this.logStartOfLoadingQuestions(quizId);
    if (!this.isValidQuizId(quizId)) return;
  
    this.quizDataService.getQuestionsForQuiz(quizId)
      .pipe(
        tap(questions => this.processFetchedQuestions(questions, quizId)),
        switchMap(questions => this.handleQuestionsSwitchMap(questions))
      )
      .subscribe({
        next: () => console.log('Subscription next handler'),
        error: error => console.error('Error while loading quiz questions:', error),
        complete: () => console.log('Subscription complete handler')
      });
  
    this.subscribeToCorrectMessage();
  }
  
  private logStartOfLoadingQuestions(quizId: string): void {
    console.log('start of loadQuestionsForQuiz');
    console.log('Quiz ID:', quizId);
    console.log('Current Question Index:', this.currentQuestionIndex);
  }
  
  private isValidQuizId(quizId: string): boolean {
    if (!quizId) {
      console.error('quizId is null or undefined.');
      return false;
    }
    return true;
  }
  
  private processFetchedQuestions(questions: QuizQuestion[], quizId: string): void {
    if (questions && questions.length > 0) {
      this.currentQuestion = questions[0];
      this.updateCurrentQuestionAndCorrectAnswers(this.currentQuestion);
    } else {
      console.error('No questions found for quiz with ID:', quizId);
    }
  }
  
  private handleQuestionsSwitchMap(questions: QuizQuestion[]): Observable<any> {
    if (questions && questions.length > 0) {
      return this.processCombinedQuestionData(this.currentQuestion);
    } else {
      return of(undefined);
    }
  }
  
  private processCombinedQuestionData(question: QuizQuestion): Observable<any> {
    // Fetch all quizzes and find the one containing the question
    return this.quizService.getQuizData().pipe(
      map((quizzes: Quiz[]) => {
        const relatedQuiz = quizzes.find(quiz => quiz.questions.some(q => q.questionText === question.questionText));
        if (!relatedQuiz) {
          throw new Error(`Quiz containing the question not found`);
        }
  
        // Find the index of the question in the quiz
        const questionIndex = relatedQuiz.questions.findIndex(q => q.questionText === question.questionText);
  
        // If additional data is needed, like specific question details
        const questionData = this.quizService.getQuestionData(relatedQuiz.quizId, questionIndex);
        if (!questionData) {
          throw new Error('Question data not found');
        }
  
        // Combine the question with its related quiz and additional data
        return {
          question: question,
          quiz: relatedQuiz,
          additionalData: questionData
        };
      }),
      catchError(error => {
        console.error('Error processing combined question data:', error);
        // Handle the error or rethrow it
        return throwError(error);
      })
    );
  }  
  
  private updateCurrentQuestionAndCorrectAnswers(question: QuizQuestion): void {
    this.updateCurrentQuestion(question);
    this.checkAndUpdateCorrectAnswers(question);
  }
  
  private checkAndUpdateCorrectAnswers(question: QuizQuestion): void {
    const currentCorrectAnswers = this.quizService.correctAnswers.get(question.questionText);
    if (!currentCorrectAnswers || currentCorrectAnswers.length === 0) {
      this.quizService.setCorrectAnswers(question, question.options);
    }
  }
  
  private subscribeToCorrectMessage(): void {
    this.quizService.correctMessage$.subscribe(message => {
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

  private updateCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion = question;
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
    data.isMultipleAnswer = await this.quizStateService.isMultipleAnswer(
      this.question
    );
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
          this.quizService.shuffle(this.currentOptions);
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
    if (this.correctAnswers.length === 1) {
      if (this.currentQuestion && this.currentQuestion?.options) {
        this.currentQuestion?.options.forEach((option) => {
          option.selected = false;
          option.styleClass = '';
        });
      }
    }
  }

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion.options
    ) {
      this.currentQuestion.options.forEach((option) => {
        option.styleClass = '';
      });

      const selectedOption = this.currentQuestion.options[optionIndex];
      selectedOption.styleClass = selectedOption.correct
        ? 'correct'
        : 'incorrect';
      this.showFeedback = true;
    }
  }

  /* async onOptionClicked(option: Option): Promise<void> {
    this.selectedOption = option;
    this.quizService.addSelectedOption(option);

    this.quizStateService.currentQuestion$
      .pipe(take(1))
      .subscribe((currentQuestion: QuizQuestion) => {
        this.currentQuestion = currentQuestion;
        this.processOptionSelection(this.currentQuestion, option);
      });

    this.updateAnswersForOption(option);
    this.checkAndHandleCorrectAnswer();
    this.logDebugInformation();

    this.explanationTextService.setShouldDisplayExplanation(true);
    this.explanationTextService.toggleExplanationDisplay(true);
    this.cdRef.detectChanges();
  } */

  async onOptionClicked(option: Option, event?: MouseEvent): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    
    this.selectedOption = option;
    this.explanationTextService.setShouldDisplayExplanation(true);
    this.explanationTextService.toggleExplanationDisplay(true);
  
    // Force UI update once after making all synchronous state changes
    this.cdRef.detectChanges();
  
    // Now handle asynchronous operations
    this.quizService.addSelectedOption(option);
  
    try {
      const currentQuestion = await firstValueFrom(this.quizStateService.currentQuestion$.pipe(take(1)));
      this.currentQuestion = currentQuestion as QuizQuestion;
      this.processOptionSelection(this.currentQuestion, option);
  
      // Other updates that don't immediately affect the UI can remain in the asynchronous part
      this.updateAnswersForOption(option);
      this.checkAndHandleCorrectAnswer();
      this.logDebugInformation();
    } catch (error) {
      console.error('Error handling option click:', error);
    }
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

  private updateAnswersForOption(option: Option): void {
    const answerIndex = this.answers.findIndex(
      (answer) => answer === option.value
    );

    if (answerIndex !== -1) {
      this.answers[answerIndex] = true;
    }

    // Emit the updated answers
    this.quizService.answersSubject.next(this.answers);
  }

  private logDebugInformation(): void {
    console.log('Answers:', this.answers);
  }

  private async checkAndHandleCorrectAnswer(): Promise<void> {
    const isCorrect = await this.quizService.checkIfAnsweredCorrectly();
    console.log("ISCORRECT", isCorrect);

    if (isCorrect) {
      // Stop the timer and provide an empty callback
      this.timerService.stopTimer(() => {
        console.log('Correct answer selected!');
        // add additional logic here
      });
    }
  }

  handleOptionClicked(currentQuestion: QuizQuestion, option: Option): void {
    const isOptionSelected = this.checkOptionSelected(option);
    const index = this.selectedOptions.findIndex((o) => o === option);

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
    this.quizStateService
      .isMultipleAnswer(currentQuestion)
      .subscribe({
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
    this.questions.subscribe({
      next: (questionsArray: QuizQuestion[]) => {
        const questionIndex = questionsArray.findIndex((q) =>
          this.isSameQuestion(q, currentQuestion)
        );
        this.setExplanationText(questionIndex);
      },
      error: (error: Error) => {
        console.error('Error fetching questions array:', error);
      }
    });
  }

  private isSameQuestion(
    question1: QuizQuestion,
    question2: QuizQuestion
  ): boolean {
    return (
      question1.questionText === question2.questionText &&
      question1.explanation === question2.explanation
    );
  }

  checkOptionSelected(option: Option): boolean {
    return this.selectedOptions.includes(option as Option);
  }

  selectOption(currentQuestion: QuizQuestion, option: any): void {
    this.selectedOptions = [option];
    this.showFeedbackForOption = { [option.optionId]: true };
    this.showFeedback = true;
    this.selectedOption = option;
    this.selectionMessageService.updateSelectionMessage(
      'Please click the next button to continue...'
    );

    this.quizQuestionManagerService.setExplanationText(
      this.currentQuestion?.explanation || null
    );
    this.quizQuestionManagerService.setSelectedOption(option);

    // Emit events and update states after the option is selected
    this.isOptionSelected = true;
    this.isAnswered = this.selectedOptions.length > 0;
    this.optionClicked.emit();
    this.isAnsweredChange.emit(this.isAnswered);
    this.isAnswerSelectedChange.emit(this.isAnswered);
    this.optionSelected.emit(this.isOptionSelected);

    this.selectionChanged.emit({
      question: currentQuestion,
      selectedOptions: this.selectedOptions,
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
    console.log('Before update - explanationText:', explanationText);
    this.explanationText$.next(explanationText);
    console.log('After update - explanationText:', explanationText);
    this.updateCombinedQuestionData(
      this.questions[questionIndex],
      explanationText
    );
    this.emitUIUpdateEvents();
  }

  private emitUIUpdateEvents(): void {
    this.isAnswerSelectedChange.emit(true);
    this.toggleVisibility.emit();
    this.updateFeedbackVisibility();
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

  updateFeedbackVisibility(): void {
    const isOptionSelected = this.selectedOptions.length > 0;
    const isFeedbackVisible =
      isOptionSelected &&
      this.showFeedbackForOption[this.selectedOption.optionId];

    this.showFeedback = isFeedbackVisible;
  }

  isSelectedOption(option: Option): boolean {
    return this.selectedOption === option;
  }

  /* isSelectedOption(option: Option): boolean {
    return this.currentQuestion?.selectedOptions?.includes(option);
  } */

  // not called anywhere...
  updateSelectedOption(selectedOption: Option, optionIndex: number): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);

    if (this.selectedOption === selectedOption) {
      this.selectedOption = null;
    } else {
      this.selectedOption = selectedOption;
    }

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(this.selectedOption, optionIndex);
    this.playSound(this.selectedOption);
  }

  updateSelection(optionIndex: number): void {
    const option = this.currentQuestion?.options[optionIndex];
    this.showFeedback = true;
    if (option && this.currentQuestion && this.currentQuestion?.options) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  playSound(selectedOption: Option): void {
    if (!selectedOption || selectedOption === undefined) {
      console.log(
        'Selected option is undefined or null, or current question/options are empty.'
      );
      return;
    }

    console.log('Selected option:', selectedOption.text);

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
  }
}