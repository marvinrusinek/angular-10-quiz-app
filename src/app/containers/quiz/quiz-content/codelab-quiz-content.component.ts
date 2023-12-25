import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  forkJoin,
  from,
  Observable,
  of,
  Subject,
  Subscription,
} from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { isEqual } from 'lodash';

import { CombinedDataType } from '../../../shared/models/CombinedDataType.type';
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
  @Input() combinedQuestionData$: Observable<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentQuestion: QuizQuestion;
    currentOptions: Option[];
    isNavigatingToPrevious: boolean;
    formattedExplanation?: string;
  }> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() nextQuestionText: string;
  @Input() previousQuestionText: string;
  @Input() correctAnswersText: string;
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

  currentQuestionText: string;
  currentDisplayText = '';
  displayedText = '';
  displayCorrectAnswers = false;
  showExplanation = false;
  isExplanationTextDisplayed = false;
  nextExplanationText = '';
  nextExplanationText$: Observable<string>;
  displayExplanation$: Observable<boolean>;
  isExplanationTextDisplayed$: Observable<boolean>;
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  shouldDisplayExplanation$: Observable<boolean>;
  isExplanationDisplayed = false;
  showNumberOfCorrectAnswersText = false;
  shouldDisplayCorrectAnswersText$: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  displayCorrectAnswersText = false;
  explanationDisplayed = false;

  private isNavigatingToPreviousQuestion: Observable<boolean>;

  private shouldDisplayCorrectAnswersSource = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$: Observable<boolean> =
    this.shouldDisplayCorrectAnswersSource.asObservable();
  shouldDisplayCorrectAnswersAfterQuestion = false;

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
    this.setupObservables();
    this.subscribeToQuestionChanges();
    this.subscribeToExplanationChanges();
    this.subscribeToFormattedExplanationChanges();

    this.combinedQuestionData$.pipe(takeUntil(this.destroy$))
    .subscribe(data => {
      console.log('Combined Question Data:', data);
      if (data && data.currentQuestion) {
        this.quizStateService.isMultipleAnswer(data.currentQuestion)
          .pipe(takeUntil(this.destroy$))
          .subscribe((isMultipleAnswer: boolean) => {
            this.shouldDisplayCorrectAnswers = isMultipleAnswer;
          });
      } else {
        this.shouldDisplayCorrectAnswers = false;
      }
    });
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

  private initializeComponent(): void {
    this.initializeQuestionData();
    this.initializeNextQuestionSubscription();
    this.initializeExplanationTextSubscription();
    this.initializeCombinedQuestionData();
    this.setupOptions();
  }

  private setupObservables(): void {
    this.setupExplanationTextDisplay();
    this.setupExplanationTextObservable();
    this.setupFormattedExplanationObservable();
  }

  private setupExplanationTextObservable(): void {
    this.explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      this.selectedOptionService.selectedOptionExplanation$,
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) =>
        selectedOptionExplanation || explanationText
      )
    );
  }

  private setupFormattedExplanationObservable(): void {
    this.formattedExplanation$
      .pipe(
        withLatestFrom(this.quizService.currentQuestionIndex$),
        distinctUntilChanged((prev, curr) => prev[0] === curr[0] && prev[1] === curr[1]),
        takeUntil(this.destroy$)
      )
      .subscribe(([formattedExplanation, currentQuestionIndex]) => {
        if (formattedExplanation !== null && formattedExplanation !== undefined) {
          this.formattedExplanation = formattedExplanation;

          console.log('Received new formatted explanation:', formattedExplanation);
          console.log('Current question index:', currentQuestionIndex);

          this.explanationTextService.updateFormattedExplanation(currentQuestionIndex, this.formattedExplanation);

          console.log('Formatted explanation updated for question index:', currentQuestionIndex);
        }
      });
  }

  private subscribeToQuestionChanges(): void {
    this.quizService.currentQuestionIndex$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (index) => {
          console.log('Current question index::::>>', index);
        },
        error: (error) => {
          console.error('Error in getCurrentQuestionIndex$ subscription:', error);
        }
      });
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
        console.log('Formatted Explanation Received:', formattedExplanation);
        this.explanationToDisplay = formattedExplanation;
      }
    );    
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params) => this.fetchQuestionsAndExplanationTexts(params)),
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
    console.log('Explanation Texts from API:', explanationTexts);
  }
  
  private collectQuestionsWithExplanations(questions: QuizQuestion[]): void {
    this.questionsWithExplanations = questions.map((question) => ({
      question,
      explanation: question.explanation || '',
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
    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        this.options = question.options;
      }
    });
  
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$.subscribe(
      async (question: QuizQuestion) => {
        if (question) {
          await this.processCurrentQuestion(question);
        }
      }
    );
  }
  
  private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    this.quizQuestionManagerService.setCurrentQuestion(question);
    this.calculateAndDisplayNumberOfCorrectAnswers(question);
    await this.fetchAndDisplayExplanationText(question);
  }
  
  private calculateAndDisplayNumberOfCorrectAnswers(question: QuizQuestion): void {
    this.numberOfCorrectAnswers = this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
      question.options
    );
  
    const correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
      this.numberOfCorrectAnswers
    );
  
    this.correctAnswersTextSource.next(correctAnswersText);
  }
  
  private async fetchAndDisplayExplanationText(question: QuizQuestion): Promise<void> {
    const questions: QuizQuestion[] = await this.quizDataService
      .getQuestionsForQuiz(this.quizId)
      .toPromise();
  
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
    console.log('Setting explanation text for question index:', questionIndex);
    console.log('Fetching explanation text for question index:', questionIndex);
    console.log('Explanation text from the API:', nextExplanationText);
    this.explanationTextService.setExplanationTextForQuestionIndex(questionIndex, nextExplanationText);
    console.log('Set explanation for index', questionIndex, ':', nextExplanationText);
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
      .pipe(
        tap((nextQuestion) =>
          console.log('Next question received', nextQuestion)
        )
      )
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
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText),
      tap(explanation => console.log('Final Explanation:', explanation))
    ) as Observable<string>;

    console.log('Explanation Text Observable::>>', this.explanationText$);

    this.explanationText$.subscribe({
      next: displayText => console.log('Received Explanation Text::>>', displayText),
      complete: () => console.log('Explanation Text Observable completed.'),
      error: err => console.error('Error in Explanation Text Observable:', err)
    });
  }

  private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.combineCurrentQuestionAndOptions();
  
    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;
  
    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
      this.formattedExplanation$,
    ]).pipe(
      switchMap(([currentQuestionData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation]) =>
        this.calculateCombinedQuestionData(currentQuestionData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation)
      )
    );
  }
  
  private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
    return this.currentQuestion$.pipe(
      withLatestFrom(this.currentOptions$),
      map(([currentQuestion, currentOptions]) => ({
        currentQuestion,
        currentOptions,
      }))
    );
  }
  
  private calculateCombinedQuestionData(
    currentQuestionData: { currentQuestion: QuizQuestion | null, currentOptions: Option[] },
    numberOfCorrectAnswers: number | undefined,
    isExplanationDisplayed: boolean,
    formattedExplanation: string
  ): Observable<any> {
    const { currentQuestion, currentOptions } = currentQuestionData;
  
    const questionText = currentQuestion ? this.getQuestionText(currentQuestion, this.questions) : '';
  
    if (currentQuestion && this.questions.length > 0) {
      const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer(currentQuestion);
  
      let correctAnswersText = '';
      if (
        questionHasMultipleAnswers &&
        !isExplanationDisplayed &&
        numberOfCorrectAnswers !== undefined &&
        numberOfCorrectAnswers > 1
      ) {
        correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
      }
  
      return of({
        questionText,
        currentQuestion,
        explanationText: formattedExplanation,
        correctAnswersText,
        currentOptions,
        isNavigatingToPrevious: false,
        formattedExplanation,
      });
    } else {
      console.log('currentQuestion or this.questions is null');
      return of({
        questionText: '',
        currentQuestion: null,
        explanationText: '',
        correctAnswersText: '',
        currentOptions: [],
        isNavigatingToPrevious: false,
        formattedExplanation: '',
      });
    }
  }

  private setupExplanationTextSubscription(): void {
    this.quizQuestionManagerService.explanationText$.subscribe(
      (explanationText) => {
        this.currentDisplayText = explanationText
          ? explanationText
          : this.currentQuestion?.getValue()?.questionText || '';
      }
    );
  }

  private setupCombinedQuestionData(): void {
    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.previousQuestion$ = this.quizService.previousQuestion$;
    this.explanationText$ = this.explanationTextService.explanationText$;
    this.shouldDisplayExplanation$ =
      this.explanationTextService.shouldDisplayExplanation$;

    this.isNavigatingToPreviousQuestion = combineLatest([
      this.nextQuestion$,
      this.quizService.nextOptions$
    ]).pipe(
      map(([nextQuestion, nextOptions]) => {
        // Determine if navigating to a previous question
        const targetQuestionIndex = this.quizService.currentQuestionIndex - 1;
        return targetQuestionIndex >= 0; // Set to true if navigating to a previous question
      })
    );

    const questionToDisplay$ = this.isNavigatingToPreviousQuestion.pipe(
      switchMap((isNavigating) =>
        isNavigating ? this.previousQuestion$ : this.nextQuestion$
      )
    );

    this.isNavigatingToPreviousQuestion.subscribe((isNavigatingToPrevious) => {
      forkJoin({
        questionToDisplay: questionToDisplay$,
        nextOptions: this.quizService.nextOptions$,
        explanationText: this.explanationTextService.formattedExplanation$,
        correctAnswersText: this.correctAnswersText$
      })
      .pipe(
        switchMap(
          ({
            questionToDisplay,
            nextOptions,
            explanationText,
            correctAnswersText
          }) => {
            return from(this.quizStateService.isMultipleAnswer(questionToDisplay)).pipe(
              map(isMultipleAnswer => ({
                questionToDisplay,
                nextOptions,
                explanationText,
                correctAnswersText,
                isMultipleAnswer
              }))
            );
          }
        ),
        map(
          ({
            questionToDisplay,
            nextOptions,
            explanationText,
            correctAnswersText,
            isMultipleAnswer
          }) => {
            const questionText = isNavigatingToPrevious
              ? `${this.previousQuestionText} ${correctAnswersText}`
              : questionToDisplay?.questionText || '';
  
            return {
              questionText: isMultipleAnswer ? `${questionText} (Multiple Answers)` : questionText,
              explanationText: explanationText,
              correctAnswersText: correctAnswersText,
              currentQuestion: questionToDisplay || null,
              currentOptions: nextOptions || [],
              isNavigatingToPrevious: isNavigatingToPrevious
            };
          }
        )
      )
      .subscribe((combinedData) => {
        console.log('Combined Data:', combinedData);
        this.combinedQuestionData$ = of(combinedData as CombinedDataType);
      });
    });  
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
    this.explanationTextService.formattedExplanation$.subscribe(explanations => {
      console.log('Formatted Explanation Values:::>>>>>', explanations);
    });
  
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
      return of(textToDisplay).pipe(startWith(textToDisplay));
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
  
  shouldDisplayCorrectAnswersText(data: any): void {
    if (!data || !data.currentQuestion) {
      this.displayCorrectAnswers = false;
      return;
    }

    this.quizStateService.isMultipleAnswer(data.currentQuestion)
      .pipe(takeUntil(this.destroy$))
      .subscribe((isMultipleAnswer: boolean) => {
        this.shouldDisplayCorrectAnswers = isMultipleAnswer;
      });
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
