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

interface ExtendedQuestionDataType extends CombinedQuestionDataType {
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
  nextExplanationText = '';
  isExplanationTextDisplayed$: Observable<boolean>;
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');
  isExplanationDisplayed = false;
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
  }

  ngOnInit(): void {
    this.questionStateSubscription.add(
      this.quizQuestionManagerService.currentQuestion$
        .subscribe((question: QuizQuestion) => {
          if (question) {
            this.currentQuestion.next(question);
            this.shouldDisplayCorrectAnswers = 
              this.quizQuestionManagerService
                .shouldDisplayNumberOfCorrectAnswers;
          }
      })
    );

    this.initializeComponent();
    this.subscribeToFormattedExplanationChanges();
    this.processQuestionData();
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
        console.log('Current question index updated to:', index);
      });
  }
  
  private subscribeToCurrentQuestion(): void {
    this.currentQuestionSubscription = this.quizStateService.currentQuestion$
      .pipe(
        mergeMap(async (question: QuizQuestion) => {
          if (question) {
            console.log('Current question index:', this.currentQuestionIndexValue);
            console.log('Question from service:', question);
            console.log('Question from array:', this.quizService.questions[this.currentQuestionIndexValue]);

            await this.processCurrentQuestion(this.quizService.questions[this.currentQuestionIndexValue]);
          }
        })
      )
      .subscribe();
  }
  
  
  private async processCurrentQuestion(question: QuizQuestion): Promise<void> {
    console.log("Received question in processCurrentQuestion:", question);
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
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
      ? this.quizService.getQuestionText(currentQuestion, this.questions)
      : '';
  
    let correctAnswersText = '';
    if (currentQuestion && !isExplanationDisplayed && numberOfCorrectAnswers !== undefined && numberOfCorrectAnswers > 1) {
      const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer(currentQuestion);
      if (questionHasMultipleAnswers) {
        correctAnswersText = this.quizQuestionManagerService.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);
        console.log("CAT", correctAnswersText);
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

  processQuestionData(): void {
    this.combinedQuestionData$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(async (combinedData: ExtendedQuestionDataType) => {
      console.log('Data from combinedQuestionData$:', combinedData);
  
      if (combinedData && combinedData.currentQuestion) {
        // Check if the current question is multiple-answer
        const isMultipleAnswer = await firstValueFrom(
          this.quizStateService.isMultipleAnswer(combinedData.currentQuestion)
        );
  
        // Set shouldDisplayCorrectAnswers based on whether the current question is multiple-answer
        this.shouldDisplayCorrectAnswers = isMultipleAnswer;
      } else {
        this.shouldDisplayCorrectAnswers = false;
      }
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