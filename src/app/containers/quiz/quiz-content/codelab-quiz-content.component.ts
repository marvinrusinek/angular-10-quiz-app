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
  SimpleChanges
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, ParamMap, Router } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  firstValueFrom,
  forkJoin,
  Observable,
  of,
  Subject,
  Subscription
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
  withLatestFrom
} from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../shared/models/question-type.enum';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

enum QuestionType {
  SingleAnswer = 'single_answer',
  MultipleAnswer = 'multiple_answer',
  TrueFalse = 'true_false'
}

@Component({
  selector: 'codelab-quiz-content-component',
  templateUrl: './codelab-quiz-content.component.html',
  styleUrls: ['./codelab-quiz-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizContentComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Output() explanationTextChanged = new EventEmitter<string>();
  @Output() shouldDisplayExplanationChanged = new EventEmitter<boolean>();
  @Output() shouldDisplayOptionsChanged = new EventEmitter<boolean>();
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() correctAnswersText = '';
  quizId = '';
  questionIndex: number;
  questionText = '';
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<
    Option[]
  >([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;
  isNavigatingToPrevious: boolean;
  currentQuestionType: QuestionType;

  displayCorrectAnswers = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  isExplanationDisplayed = false;
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  displayCorrectAnswersText = false;
  explanationDisplayed = false;

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();

  currentQuestionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;
  explanationTexts: string[] = [];
  showExplanationText = false;

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  combinedText$: Observable<string>;

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private selectedOptionService: SelectedOptionService,
    private activatedRoute: ActivatedRoute,
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;

    this.quizService.getIsNavigatingToPrevious().subscribe(
      isNavigating => this.isNavigatingToPrevious = isNavigating
    );

    // Listen to router navigation events
    /* this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute.firstChild),
      switchMap(route => route.params),
      map(params => +params['questionIndex'])
    ).subscribe(questionIndex => {
      const questionState = this.quizStateService.getQuestionState(this.quizId, questionIndex);
      if (questionState && questionState.isAnswered) {
        this.explanationToDisplay = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
        this.explanationTextService.setShouldDisplayExplanation(true);
      } else {
        this.explanationToDisplay = '';
        this.explanationTextService.setShouldDisplayExplanation(false);
      }
      this.cdRef.detectChanges();  // Force the view to update
    }); */

    this.explanationTextService.observeExplanationTextVisibility().subscribe(isDisplayed => {
      this.showExplanationText = isDisplayed;
    });
  }

  ngOnInit(): void {
    this.shouldDisplayCorrectAnswers = true;

    this.initializeQuestionIndexSubscription();
    this.initializeResetQuizSubscription();
    this.initializeExplanationDisplaySubscription();
    this.initializeExplanationTextSubscription();

    this.restoreQuestionState();
    this.subscribeToQuestionState();
    this.updateQuizStatus();
    this.initializeComponent();
    this.handleQuestionDisplayLogic();
    this.handleQuestionUpdate(this.question);
    this.setupCombinedTextObservable();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentQuestion && changes.currentQuestion.currentValue) {
      // Ensure the current question is unwrapped from the BehaviorSubject
      const currentQuestionValue = changes.currentQuestion.currentValue.value;
      this.setDisplayStateForCorrectAnswers(currentQuestionValue);
      this.updateCorrectAnswersDisplayState();
    }
  }

  ngOnDestroy(): void {
    this.shouldDisplayCorrectAnswers = false;
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
    this.explanationTextService.resetStateBetweenQuestions();
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

  restoreQuestionState(): void {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndexValue);
    // console.log("QS", questionState, "for questionId", this.currentQuestionIndexValue);

    if (questionState) {
      const isQuestionAnswered = questionState.isAnswered;
      if (isQuestionAnswered) {
        this.quizService.displayExplanation = true;
        this.explanationText = this.explanationTextService.getExplanationTextForQuestionIndex(this.currentQuestionIndexValue);
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

  // Example from a component handling question updates
  handleQuestionUpdate(question: QuizQuestion): void {
    if (this.quizStateService.isMultipleAnswerQuestion(question)) {
      this.quizService.updateCorrectAnswersText(
        this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.quizService.numberOfCorrectAnswers)
      );
    } else {
      // Optionally clear the message or set a default message for single-answer questions
      this.quizService.updateCorrectAnswersText("Select one answer");
    }
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

        this.setQuestions(questions);
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
        this.quizDataService.getAllExplanationTextsForQuiz(this.quizId),
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

  private setQuestions(questions: QuizQuestion[]): void {
    this.questions = questions;
    this.quizService.currentQuestionIndex$
      .pipe(takeUntil(this.destroy$))
      .subscribe((index: number) => {
        this.currentQuestionIndexValue = index;
      });
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

  // Function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }


  private calculateAndDisplayNumberOfCorrectAnswers(): void {
    // Calculate the number of correct answers
    this.numberOfCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
      this.quizStateService.currentQuestion.value.options
    );

    // Get the text for the number of correct answers
    const correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
      this.numberOfCorrectAnswers
    );

    // Update the correct answers text source
    this.correctAnswersTextSource.next(correctAnswersText);
  }

  private async fetchAndDisplayExplanationText(question: QuizQuestion): Promise<void> {
    if (!question || !question.questionText) {
      console.error('Question is undefined or missing questionText');
      return;
    }

    const questions: QuizQuestion[] = await firstValueFrom(
      this.quizDataService.getQuestionsForQuiz(this.quizId)
    );

    const questionIndex = questions.findIndex((q) =>
      q.questionText.trim().toLowerCase() === question.questionText.trim().toLowerCase()
    );

    if (questionIndex === -1) {
      console.error('Current question not found in the questions array.');
      return;
    }

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
      // console.warn('Current question is the last question in the array.');
    }

    this.explanationTextService.setIsExplanationTextDisplayed(true);
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
      this.explanationTextService.shouldDisplayExplanation$
    ]).pipe(
      switchMap(this.determineTextToDisplay.bind(this)),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)),
      startWith(''),
      catchError((error: Error) => {
        console.error('Error in combinedText$ observable:', error);
        return of('');
      })
    );
  }

  private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]
  ): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) &&
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      let textToDisplay = '';

      // Determine whether to display the explanation text or the question text
      if (shouldDisplayExplanation && formattedExplanation) {
        textToDisplay = formattedExplanation;
        this.shouldDisplayCorrectAnswers = false; // Don't display correct answers if explanation is shown
      } else {
        // Display question text for single-answer questions or when explanation is not shown
        textToDisplay = shouldDisplayExplanation ? formattedExplanation : this.questionToDisplay || '';

        // Only display correct answers for multiple-answer questions without explanation
        if (!shouldDisplayExplanation && this.isCurrentQuestionMultipleAnswer()) {
          this.shouldDisplayCorrectAnswers = true;
        } else {
          this.shouldDisplayCorrectAnswers = false;
        }
      }

      return of(textToDisplay).pipe(
        tap(() => {
          // Reset the correct answers display state if explanation is not displayed
          if (!shouldDisplayExplanation) {
            this.shouldDisplayCorrectAnswers = false;
          }
        })
      );
    }
  }


  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap((question: QuizQuestion) =>
        question ? this.quizStateService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }

  private setDisplayStateForCorrectAnswers(question: QuizQuestion): void {
    const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(question);

    // Push the new state into the debounced subject
    if (isMultipleAnswer) {
      this.correctAnswersDisplaySubject.next(true);
    } else {
      this.correctAnswersDisplaySubject.next(false);
    }
  }

  private updateCorrectAnswersDisplayState(): void {
    this.isCurrentQuestionMultipleAnswer().subscribe(isMultiple => {
      const shouldDisplayCorrectAnswers = isMultiple && !this.isExplanationDisplayed;
      this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
    });
  }

  updateQuizStatus(): void {
    this.questionText = this.question.questionText;
    this.correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
    this.quizService.updateQuestionText(this.questionText);
    this.quizService.updateCorrectAnswersText(this.correctAnswersText);
  }

  updateExplanationText(newText: string) {
    this.explanationTextChanged.emit(newText);
  }

  updateShouldDisplayExplanation(newValue: boolean) {
    this.shouldDisplayExplanationChanged.emit(newValue);
  }

  updateShouldDisplayOptions(newValue: boolean) {
    this.shouldDisplayOptionsChanged.emit(newValue);
  }
}
