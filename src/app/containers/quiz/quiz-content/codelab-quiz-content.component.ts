import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges
} from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
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
  debounceTime,
  distinctUntilChanged,
  map,
  mergeMap,
  startWith,
  switchMap,
  take,
  takeUntil,
  withLatestFrom
} from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../shared/models/QuestionType.type';
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
  @Input() correctAnswersText: string = '';
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

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();

  currentQuestionSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;
  private questionStateSubscription: Subscription = new Subscription();

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;

  combinedText$: Observable<string>;

  displayCorrectAnswers = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  isExplanationDisplayed = false;
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  displayCorrectAnswersText = false;
  explanationDisplayed = false;
  isQuestionActive = false;
  isSingleAnswerQuestion = false;
  correctAnswersCountText = '';

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable().pipe(debounceTime(300));

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

    const storedText = localStorage.getItem('correctAnswersCountText') || 'Default Text';
    this.correctAnswersText = storedText;
  }

  ngOnInit(): void {
    this.shouldDisplayCorrectAnswers = true;

    this.quizService.getCurrentQuestionIndexObservable()
      .pipe(takeUntil(this.destroy$))
      .subscribe((index: number) => {
        this.currentQuestionIndexValue = index;
      });

    this.quizStateService.resetQuiz$.subscribe(() => {
      this.shouldDisplayCorrectAnswers = false;
    });

    this.updateQuizStatus();
    this.initializeComponent();
    this.subscribeToFormattedExplanationChanges();
    this.handleQuestionDisplayLogic();
    this.handleQuestionUpdate(this.question);
    this.setupCombinedTextObservable();
  }

  /* ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(changes.question.currentValue);
  
      // Only update the text if the question allows multiple answers
      if (isMultipleAnswer) {
        // Assuming getNumberOfCorrectAnswersText() method returns the desired text
        const newText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(changes.question.currentValue.numberOfCorrectAnswers);
        this.quizService.updateCorrectAnswersText(newText);
      } else {
        // Reset or clear the text if the new question does not allow multiple answers
        this.quizService.updateCorrectAnswersText('');
      }
    }
  }  */

  /* ngOnChanges(changes: SimpleChanges): void {
    if (changes.question && changes.question.currentValue) {
      this.updateDisplayForCorrectAnswers();
    }
  } */

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.currentQuestion && changes.currentQuestion.currentValue) {
      // Ensure the current question is unwrapped from the BehaviorSubject
      const currentQuestionValue = changes.currentQuestion.currentValue.value;
      this.setDisplayStateForCorrectAnswers(currentQuestionValue);
      this.updateCorrectAnswersDisplayState();
    }
  }

  /* private async setDisplayStateForCorrectAnswers(question: QuizQuestion): Promise<void> {
    const isMultipleAnswer = await this.quizStateService.isMultipleAnswerQuestion(question);
  
    if (isMultipleAnswer) {
      const numberOfCorrectAnswers = question.options.filter(option => option.correct).length;
      const displayText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
  
      this.quizService.updateCorrectAnswersText(displayText);
    } else {
      this.quizService.updateCorrectAnswersText('');
    }
  
    this.cdRef.detectChanges(); // Ensure UI updates immediately
  } */

  private setDisplayStateForCorrectAnswers(question: QuizQuestion): void {
    const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(question);
  
    // Push the new state into the debounced subject
    if (isMultipleAnswer) {
      this.correctAnswersDisplaySubject.next(true);
    } else {
      this.correctAnswersDisplaySubject.next(false);
    }
  }
  

  private updateDisplayForCorrectAnswers(): void {
    const question = this.currentQuestion.value; // Get the current value from BehaviorSubject
    const numberOfCorrectAnswers = question.options.filter(option => option.correct).length;
    const isMultipleAnswer = this.quizStateService.isMultipleAnswerQuestion(question);

    if (!isMultipleAnswer) {
      this.quizService.updateCorrectAnswersText(''); // Clear text for single-answer questions
      this.cdRef.detectChanges(); // Trigger change detection immediately to update the view
    } else {
      // Logic for multiple-answer questions, possibly involving asynchronous operations
      // Make sure to call cdRef.detectChanges() after async operations are complete to update the view
      const newText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
      this.quizService.updateCorrectAnswersText(newText);
      this.cdRef.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.shouldDisplayCorrectAnswers = false;
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
    this.questionStateSubscription?.unsubscribe();
    this.explanationTextService.resetStateBetweenQuestions();
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

  private subscribeToFormattedExplanationChanges(): void {
    this.formattedExplanationSubscription = 
      this.explanationTextService.formattedExplanation$.subscribe(
        (formattedExplanation) => {
          this.explanationToDisplay = formattedExplanation;
        }
    );    
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
  
        this.initializeCurrentQuestionIndex();
        this.setQuestions(questions);
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
        this.calculateCombinedQuestionData(currentQuestionData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation)
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

  /* private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    const textToDisplay = shouldDisplayExplanation ? 
      formattedExplanation || this.explanationToDisplay || '' : 
      this.questionToDisplay || '';
  
    return of(textToDisplay);
  } */

  /* private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    // This function now only determines what main text to display: question text or explanation
    const textToDisplay = shouldDisplayExplanation ? formattedExplanation || '' : this.questionToDisplay || '';
    return of(textToDisplay);
  } */

  /* private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && 
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      const textToDisplay = shouldDisplayExplanation ? 
        this.explanationToDisplay || '' : this.questionToDisplay || '';
  
      //this.updateCorrectAnswersDisplay(shouldDisplayExplanation);
  
      if (shouldDisplayExplanation && formattedExplanation) {
        this.explanationToDisplay = formattedExplanation; // Set explanationToDisplay
      }
  
      return of(textToDisplay);
    }
  } */

  /* private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]
  ): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) &&
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      const textToDisplay = shouldDisplayExplanation ?
        formattedExplanation || this.explanationToDisplay || '' :
        this.questionToDisplay || '';
  
      // Check if the explanation text is not empty and the correct answers text is not being displayed
      if (shouldDisplayExplanation && formattedExplanation && !this.shouldDisplayCorrectAnswers) {
        this.explanationToDisplay = formattedExplanation; // Set explanationToDisplay
      }
  
      return of(textToDisplay);
    }
  } */

  /* private determineTextToDisplay([nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && 
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      let textToDisplay = '';
  
      if (shouldDisplayExplanation && formattedExplanation) {
        textToDisplay = formattedExplanation;
      } else {
        textToDisplay = this.questionToDisplay || '';
      }
  
      // Check if the explanation text is not empty and the correct answers text is not being displayed
      if (shouldDisplayExplanation && formattedExplanation && !this.shouldDisplayCorrectAnswers) {
        textToDisplay = formattedExplanation; // Set explanationToDisplay
      }
  
      return of(textToDisplay);
    }
  } */
  
  /* private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]
  ): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && 
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      let textToDisplay = '';
  
      if (shouldDisplayExplanation && formattedExplanation) {
        textToDisplay = formattedExplanation;
      } else {
        textToDisplay = this.questionToDisplay || '';
      }
  
      return of(textToDisplay);
    }
  } */

  /* private determineTextToDisplay([nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && (!previousQuestion || !previousQuestion.questionText)) {
        return of('');
    } else {
      let textToDisplay = '';

      if (shouldDisplayExplanation && formattedExplanation) {
        textToDisplay = formattedExplanation;
        this.shouldDisplayCorrectAnswers = false; // Don't display correct answers if explanation is shown
      } else {
        textToDisplay = this.questionToDisplay || '';
        this.shouldDisplayCorrectAnswers = true; // Display correct answers for questions without explanation
      }

      return of(textToDisplay);
    }
  } */

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
  
  
  
  
  
  
  
  

  

  private updateCorrectAnswersDisplay(shouldDisplayExplanation: boolean) {
    this.shouldDisplayCorrectAnswers = !shouldDisplayExplanation;
  }

  private updateCorrectAnswersDisplayState(): void {
    // Assuming 'isExplanationDisplayed' is a boolean indicating if the explanation is currently shown
    // and is updated elsewhere in your component based on whether the explanation is being displayed
    this.isCurrentQuestionMultipleAnswer().subscribe(isMultiple => {
      const shouldDisplayCorrectAnswers = isMultiple && !this.isExplanationDisplayed;
      this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
    });
  }
  
  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap(question => 
        question ? this.quizStateService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }

  updateQuizStatus(): void {
    this.questionText = this.question.questionText;
    this.correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
    this.quizService.updateQuestionText(this.questionText);
    this.quizService.updateCorrectAnswersText(this.correctAnswersText);
  }
}
