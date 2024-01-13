import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
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
  map,
  startWith,
  switchMap,
  takeUntil,
  withLatestFrom
} from 'rxjs/operators';
import { isEqual } from 'lodash';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

interface ExtendedQuestionData extends CombinedQuestionDataType {
  isMultipleAnswer: boolean;
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
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> =
    new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<
    Option[]
  >([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;

  questionsWithExplanations: {
    question: QuizQuestion;
    explanation: string;
  }[] = [];
  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers = false;
  shouldDisplayCorrectAnswers$: Observable<boolean>;

  currentQuestionSubscription: Subscription;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  selectedOptionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;

  private correctAnswersTextSource = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;

  combinedText$: Observable<string>;

  displayCorrectAnswers = false;
  isExplanationTextDisplayed = false;
  nextExplanationText = '';
  isExplanationTextDisplayed$: Observable<boolean>;
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  isExplanationDisplayed = false;
  shouldDisplayCorrectAnswersText$: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
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
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;
    this.explanationTextService.setShouldDisplayExplanation(false);
    this.formattedExplanation$ = this.explanationTextService
      .formattedExplanation$ as BehaviorSubject<string>;
  }

  ngOnInit(): void {
    this.initializeComponent();
    this.subscribeToExplanationChanges();
    this.subscribeToFormattedExplanationChanges();
    this.processQuestionData();
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
    this.explanationTextSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
    this.selectedOptionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
    this.explanationTextService.resetStateBetweenQuestions();
  }

  processQuestionData(): void {
    this.combinedQuestionData$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async (combinedData: ExtendedQuestionData) => {
      this.isCurrentQuestionMultipleAnswer = combinedData.isMultipleAnswer;
      this.shouldDisplayCorrectAnswers = combinedData.isMultipleAnswer;
      
      await this.shouldDisplayCorrectAnswersText(combinedData);
    });
  }  

  private initializeComponent(): void {
    this.initializeQuestionData();
    this.initializeNextQuestionSubscription();
    this.initializeExplanationTextSubscription();
    this.initializeCombinedQuestionData();
    this.setupOptions();
    this.setupExplanationTextDisplay();
  }
  
  private subscribeToExplanationChanges(): void {
    this.selectedOptionSubscription =
      this.selectedOptionService.selectedOptionExplanation$.subscribe(
        (explanationText) => {
          if (explanationText) {
            this.explanationText = explanationText;
          } else {
            this.explanationText = 'No explanation available.';
          }
        }
      );
  }

  private subscribeToFormattedExplanationChanges(): void {
    this.formattedExplanationSubscription = this.explanationTextService.formattedExplanation$.subscribe(
      (formattedExplanation) => {
        this.explanationToDisplay = formattedExplanation;
      }
    );
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params: ParamMap) => this.fetchQuestionsAndExplanationTexts(params)),
        takeUntil(this.destroy$)
      )
      .subscribe(([questions, explanationTexts]) => {
        if (!questions) {
          return;
        }
  
        this.storeExplanationTexts(explanationTexts);
        this.collectQuestionsWithExplanations(questions);
        this.initializeCurrentQuestionIndex();
        this.setQuestions(questions);
        this.subscribeToCurrentQuestion();
      });
  }
  
  private fetchQuestionsAndExplanationTexts(params: ParamMap): Observable<[QuizQuestion[] | null, string[]]> {
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
  
  private storeExplanationTexts(explanationTexts: Record<number, BehaviorSubject<string>>): void {
    this.explanationTextService.explanationTexts = explanationTexts;
  }
  
  private collectQuestionsWithExplanations(questions: QuizQuestion[]): void {
    this.questionsWithExplanations = questions.map((question) => ({
      question,
      explanation: question.explanation || ''
    }));
  }
  
  private initializeCurrentQuestionIndex(): void {
    this.quizService.currentQuestionIndex = 0;
    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
  }
  
  private setQuestions(questions: QuizQuestion[]): void {
    this.questions = questions;
    this.currentQuestionIndex$.subscribe((index) => {
      this.currentQuestionIndexValue = index;
    });
  }
  
  private subscribeToCurrentQuestion(): void {
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        switchMap(async (question: QuizQuestion) => {
          if (question) {
            await this.processCurrentQuestion(this.quizService.questions[this.currentQuestionIndexValue]);
          }
        })
      )
      .subscribe();
  }
  
  private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    this.quizQuestionManagerService.setCurrentQuestion(question);
    this.calculateAndDisplayNumberOfCorrectAnswers(question);
    await this.fetchAndDisplayExplanationText(question);
  }
  
  private calculateAndDisplayNumberOfCorrectAnswers(question: QuizQuestion): void {
    const correctOptions = this.quizStateService.currentQuestion.value.options.filter(option => option.correct);
  
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
    const questions: QuizQuestion[] = await firstValueFrom(
      this.quizDataService.getQuestionsForQuiz(this.quizId)
    );
  
    const questionIndex = questions.findIndex((q) => q.questionText === question.questionText);
  
    if (questionIndex !== -1 && questionIndex < questions.length - 1) {
      const zeroBasedIndex = questionIndex - 1;
      const nextQuestion = questions[zeroBasedIndex + 1];
  
      if (nextQuestion) {
        this.setExplanationForNextQuestion(zeroBasedIndex + 1, nextQuestion);
        this.updateExplanationForQuestion(nextQuestion);
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
      if (this.areQuestionsEqual(question, this.question)) {
        this.explanationText = explanationText as string;
      } else {
        this.explanationText = null;
      }
    });
  }

  private initializeNextQuestionSubscription(): void {
    this.nextQuestionSubscription = this.quizService.nextQuestion$
      .subscribe((nextQuestion) => {
        const question = nextQuestion as QuizQuestion;
        if (nextQuestion) {
          this.currentQuestion.next(question);
          this.currentOptions$.next(question.options);
        } else {
          // Handle the scenario when there are no more questions
          this.router.navigate(['/results']);
        }
      });
  }

  private initializeExplanationTextSubscription(): void {
    const explanationText$ = this.explanationTextService.getExplanationText$();
    const selectedOptionExplanation$ = this.selectedOptionService.selectedOptionExplanation$;

    this.explanationText$ = combineLatest([explanationText$, selectedOptionExplanation$]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    ) as Observable<string>;
  }

  private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.combineCurrentQuestionAndOptions();
  
    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;
  
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
  
  private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
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
  
    const questionText = currentQuestion
      ? this.getQuestionText(currentQuestion, this.questions)
      : '';
  
    let correctAnswersText = '';
    if (currentQuestion && !isExplanationDisplayed && numberOfCorrectAnswers !== undefined && numberOfCorrectAnswers > 1) {
      const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer(currentQuestion);
      if (questionHasMultipleAnswers) {
        correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
      }
    }
  
    const combinedQuestionData: CombinedQuestionDataType = {
      questionText: questionText,
      currentQuestion: currentQuestion,
      explanationText: formattedExplanation,
      correctAnswersText: correctAnswersText,
      currentOptions: currentOptions,
      isNavigatingToPrevious: false,
      formattedExplanation: formattedExplanation
    };
  
    return of(combinedQuestionData);
  }  

  private setupOptions(): void {
    // Update the options$ initialization using combineLatest
    this.options$ = combineLatest([
      this.currentQuestion$,
      this.currentOptions$
    ]).pipe(
      map(([currentQuestion, currentOptions]) => {
        if (currentQuestion && currentQuestion.options) {
          return currentQuestion.options;
        }
        return [];
      })
    );
  }

  private setupExplanationTextDisplay(): void {    
    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.previousQuestion$,
      this.explanationTextService.nextExplanationText$,
      this.explanationTextService.formattedExplanation$,
      this.explanationTextService.shouldDisplayExplanation$
    ]).pipe(
      switchMap(this.determineTextToDisplay.bind(this)),
      startWith(''),
      catchError(this.handleError.bind(this))
    );
  }
  
  private determineTextToDisplay([nextQuestion, previousQuestion, nextExplanationText, formattedExplanation, shouldDisplayExplanation]): Observable<string> {
    if ((!nextQuestion || !nextQuestion.questionText) && (!previousQuestion || !previousQuestion.questionText)) {
      return of('');
    } else {
      const textToDisplay = shouldDisplayExplanation ? this.explanationToDisplay || '' : this.questionToDisplay || '';
      return of(textToDisplay);
    }
  }

  private handleError(error: any): Observable<string> {
    console.error('An error occurred:', error);
    return of('Error: unable to load explanation text');
  }  

  getQuestionText(
    currentQuestion: QuizQuestion,
    questions: QuizQuestion[]
  ): string {
    if (currentQuestion && questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        if (this.areQuestionsEqual(currentQuestion, questions[i])) {
          return questions[i]?.questionText;
        }
      }
    }
    return '';
  }
  
  async shouldDisplayCorrectAnswersText(data: CombinedQuestionDataType): Promise<void> {
    this.shouldDisplayCorrectAnswers = false;
  
    if (data && data.currentQuestion) {
      const currentQuestionHasMultipleAnswers = await firstValueFrom(
        this.quizStateService.isMultipleAnswer(data.currentQuestion)
      );
  
      console.log("Multiple Answers?", currentQuestionHasMultipleAnswers);
      console.log("Current Question", data.currentQuestion);
  
      this.shouldDisplayCorrectAnswers = currentQuestionHasMultipleAnswers;
    }
  }
  
  
  

  /* async shouldDisplayCorrectAnswersText(data: CombinedQuestionDataType): Promise<boolean> {
    const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(data.currentOptions);
  
    // Determine if it's a multiple-answer question
    const isMultipleAnswer = numberOfCorrectAnswers > 1;

    this.shouldDisplayCorrectAnswers = isMultipleAnswer && !this.isExplanationTextDisplayed;
  
    return this.shouldDisplayCorrectAnswers;
  } */

  calculateNumberOfCorrectAnswers(options: Option[]): number {
    const safeOptions = options ?? [];
    const numberOfCorrectAnswers = safeOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }

  getNumberOfCorrectAnswers(data: any): number {
    const correctAnswers = data?.correctAnswers || [];
    return correctAnswers.length;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return isEqual(question1, question2);
  }
}
