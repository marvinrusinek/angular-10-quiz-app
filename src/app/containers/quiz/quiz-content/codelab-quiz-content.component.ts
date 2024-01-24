import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit
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
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

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

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers = false;
  shouldDisplayCorrectAnswers$: Observable<boolean>;

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
  isCurrentQuestionMultipleAnswer: boolean;

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private selectedOptionService: SelectedOptionService,
    private activatedRoute: ActivatedRoute
  ) {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;

    this.quizService.getIsNavigatingToPrevious().subscribe(
      isNavigating => this.isNavigatingToPrevious = isNavigating
    );
  }

  ngOnInit(): void {
    this.quizService.getCurrentQuestionIndexObservable()
      .pipe(takeUntil(this.destroy$))
      .subscribe((index: number) => {
        this.currentQuestionIndexValue = index;
      });

    this.quizStateService.resetQuiz$.subscribe(() => {
      this.shouldDisplayCorrectAnswers = false;
    });    

    this.initializeComponent();
    this.subscribeToFormattedExplanationChanges();
    this.handleQuestionDisplayLogic();
    this.setupCombinedTextObservable();
  }

  ngOnChanges(): void {
    if (
      this.correctAnswersText !== undefined &&
      this.quizStateService.isMultipleAnswer(this.question)
    ) {
      this.correctAnswersTextSource.next(this.correctAnswersText);
    } else {
      this.correctAnswersTextSource.next('');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
    this.questionStateSubscription?.unsubscribe();
    this.explanationTextService.resetStateBetweenQuestions();
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

  /* private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    // Fetch and display explanation for the previous question
    await this.fetchAndDisplayExplanationText(question);

    // Update question details
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
    this.calculateAndDisplayNumberOfCorrectAnswers();

    // React to changes in explanation display state
    this.isExplanationTextDisplayed$.pipe(
      take(1),
      switchMap(isExplanationDisplayed => 
        this.quizStateService.isMultipleAnswer(question).pipe(
          map(isMultiple => isMultiple && !isExplanationDisplayed)
        )
      )
    ).subscribe((shouldDisplay: boolean) => {
      this.shouldDisplayCorrectAnswers = shouldDisplay;
    });
  } */

  private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    // Fetch and display explanation for the question
    await this.fetchAndDisplayExplanationText(question);

    // Update question details
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
    this.calculateAndDisplayNumberOfCorrectAnswers();

    // Determine whether to display correct answers count
    const isExplanationDisplayed = await this.isExplanationTextDisplayed$.pipe(take(1)).toPromise();
    const isMultipleAnswer = await this.quizStateService.isMultipleAnswer(question).toPromise();

    this.shouldDisplayCorrectAnswers = isMultipleAnswer && !isExplanationDisplayed;
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

    const questionIndex = questions.findIndex((q) => q.questionText === question.questionText);
    if (questionIndex !== -1 && questionIndex < questions.length - 1) {
      const nextQuestion = questions[questionIndex + 1];

      if (nextQuestion) {
        this.setExplanationForNextQuestion(questionIndex + 1, nextQuestion);
        this.updateExplanationForQuestion(nextQuestion);
        this.shouldDisplayCorrectAnswers = false;
      } else {
        console.warn('Next question not found in the questions array.');
      }
    } else {
      console.warn('Current question not found in the questions array.');
    }
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
      const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer(currentQuestion);
      if (questionHasMultipleAnswers) {
        correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
      }
    }
  
    const combinedQuestionData: CombinedQuestionDataType = {
      questionText: currentQuestion.questionText,
      currentQuestion: currentQuestion,
      currentOptions: currentOptions,
      explanationText: currentQuestion.explanation,
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
          return this.quizStateService.isMultipleAnswer(combinedData.currentQuestion).pipe(
            map(isMultipleAnswer => ({
              combinedData,
              isMultipleAnswer
            }))
          );
        } else {
          return of({ combinedData, isMultipleAnswer: false });
        }
      })
    ).subscribe(({ combinedData, isMultipleAnswer }) => {
      console.log('Data from combinedQuestionData$::::::', combinedData);
      this.shouldDisplayCorrectAnswers = isMultipleAnswer;
    });
  }

  private setupCombinedTextObservable(): void {
    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.previousQuestion$,
      this.explanationTextService.nextExplanationText$,
      this.explanationTextService.formattedExplanation$,
      this.explanationTextService.shouldDisplayExplanation$
    ]).pipe(
      switchMap(this.determineTextToDisplay.bind(this)),
      startWith(''),
      catchError((error: Error) => {
        console.error('Error in combinedText$ observable:', error);
      })
    );
  }  
  
  private determineTextToDisplay(
    [nextQuestion, previousQuestion, nextExplanationText, 
     formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && 
        (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      const textToDisplay = shouldDisplayExplanation ? 
        this.explanationToDisplay || '' : this.questionToDisplay || '';
      return of(textToDisplay);
    }
  }
}