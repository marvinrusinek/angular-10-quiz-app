import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BehaviorSubject,
  combineLatest,
  forkJoin,
  Observable,
  of,
  Subject,
  Subscription,
} from 'rxjs';
import {
  distinctUntilChanged,
  map,
  startWith,
  switchMap,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';
import { isEqual } from 'lodash';

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
    this.initializeQuestionData();
    this.initializeNextQuestionSubscription();
    this.initializeExplanationTextSubscription();
    this.initializeCombinedQuestionData();
    this.setupExplanationTextSubscription();
    this.setupCombinedQuestionData();
    this.setupOptions();
    this.setupExplanationTextDisplay();

    // Combine explanationTextService's observable with selectedOptionExplanation$
    this.explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      this.selectedOptionService.selectedOptionExplanation$,
    ]).pipe(
      map(
        ([explanationText, selectedOptionExplanation]: [string, string]) =>
          selectedOptionExplanation || explanationText
      )
    ) as Observable<string>;

    // Subscribe to the selectedOptionExplanation$ observable and store the subscription
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

    this.currentQuestion$.next(this.question);

    this.currentQuestion$.subscribe(newQuestion => {
      this.formattedExplanation = '';
    });

    /* this.explanationTextService.formattedExplanation$.subscribe((formattedExplanation) => {
      if (formattedExplanation !== null) {
        console.log('Received new formatted explanation:', formattedExplanation);
        this.formattedExplanation = formattedExplanation;
      }
    }); */

    this.explanationTextService.formattedExplanation$
      .pipe(distinctUntilChanged())
      .subscribe((formattedExplanation) => {
        console.log('Received new formatted explanation:', formattedExplanation);
        this.formattedExplanation = formattedExplanation;
      });

    this.explanationTextService.formattedExplanation$.subscribe((formattedExplanation) => {
      console.log('Received new formatted explanation:', formattedExplanation);
      this.formattedExplanation = formattedExplanation;
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
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params) => {
          this.quizId = params.get('quizId');
          if (this.quizId) {
            return forkJoin([
              this.quizDataService.getQuestionsForQuiz(this.quizId),
              this.quizDataService.getAllExplanationTextsForQuiz(this.quizId),
            ]);
          } else {
            return of([null, []]);
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(([questions, explanationTexts]) => {
        if (!questions) {
          return;
        }

        // Store explanation texts in an array
        this.explanationTextService.explanationTexts = explanationTexts;

        // Collect explanations for all questions
        this.questionsWithExplanations = questions.map((question) => ({
          question,
          explanation: question.explanation || '',
        }));

        // Initialize the current question index
        this.quizService.currentQuestionIndex = 0;

        // Set the questions
        this.questions = questions;
        this.currentQuestionIndex$ =
          this.quizService.getCurrentQuestionIndexObservable();
      });

    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        this.options = question.options;
      }
    });

    this.currentQuestionIndex$ =
      this.quizService.getCurrentQuestionIndexObservable();
    this.currentQuestionIndex$.subscribe((index) => {
      this.currentQuestionIndexValue = index;
    });

    this.quizStateService.currentQuestion$.subscribe((question) => {
      this.question = question;

      if (question && question.options) {
        console.log('Options:', question.options);
      }
    });

    this.currentQuestionSubscription =
      this.quizStateService.currentQuestion$.subscribe(
        async (question: QuizQuestion) => {
          if (question) {
            this.quizQuestionManagerService.setCurrentQuestion(question);
            this.numberOfCorrectAnswers =
              this.quizQuestionManagerService.calculateNumberOfCorrectAnswers(
                question.options
              );
            const correctAnswersText =
              this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
                this.numberOfCorrectAnswers
              );
            this.correctAnswersTextSource.next(correctAnswersText);

            const questions: QuizQuestion[] = await this.quizDataService
              .getQuestionsForQuiz(this.quizId)
              .toPromise();
            console.log('After fetching questions:', questions);

            console.log('Current Question:>', question.questionText);
            console.log(
              'All Questions:>',
              questions.map((q) => q.questionText)
            );

            // Get the index of the current question
            // const questionIndex = questions.indexOf(question);
            const questionIndex = questions.findIndex(
              (q) => q.questionText === question.questionText
            );

            console.log('Question Index:>', questionIndex);

            if (questionIndex !== -1 && questionIndex < questions.length - 1) {
              const nextQuestion = questions[questionIndex + 1];
              const nextExplanationText = nextQuestion.explanation; // Use the explanation from the next question
              this.explanationTextService.setExplanationTextForQuestionIndex(
                questionIndex + 1,
                nextExplanationText
              );

              console.log(
                'Explanation Texts Object:',
                this.explanationTextService.explanationTexts
              );

              this.updateExplanationForQuestion(nextQuestion);
            } else {
              console.warn(
                'Current question not found in the questions array.'
              );
            }
          }
        }
      );
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
        if (nextQuestion) {
          this.currentQuestion.next(nextQuestion);
          this.currentOptions$.next(nextQuestion.options);
        } else {
          // Handle the scenario when there are no more questions
          this.router.navigate(['/results']);
        }
      });
  }

  private initializeExplanationTextSubscription(): void {
    const selectedOptionExplanation$ =
      this.selectedOptionService.selectedOptionExplanation$;

    this.explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      selectedOptionExplanation$,
    ]).pipe(
      tap(([explanationText, selectedOptionExplanation]) => {
        console.log('Explanation Text:', explanationText);
        console.log('Selected Option Explanation:', selectedOptionExplanation);
      }),
      map(
        ([explanationText, selectedOptionExplanation]) =>
          selectedOptionExplanation || explanationText
      ),
      tap((explanation) => {
        console.log('Final Explanation:', explanation);
      })
    ) as Observable<string>;

    this.explanationTextSubscription = this.explanationText$.subscribe(
      (displayText) => {
        this.quizQuestionManagerService.setExplanationText(displayText);
        this.quizQuestionManagerService.setExplanationDisplayed(!!displayText);
      }
    );
  }

  private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.currentQuestion$.pipe(
      withLatestFrom(this.currentOptions$),
      map(([currentQuestion, currentOptions]) => ({
        currentQuestion,
        currentOptions,
      }))
    );

    this.isExplanationTextDisplayed$ =
      this.explanationTextService.isExplanationTextDisplayed$;

    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
      this.formattedExplanation$,
    ]).pipe(
      switchMap(
        ([
          { currentQuestion, currentOptions },
          numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation,
        ]) => {
          // Calculate question text
          const questionText = currentQuestion
            ? this.getQuestionText(currentQuestion, this.questions)
            : '';

          if (currentQuestion && this.questions.length > 0) {
            // Get the question index
            const questionIndex = this.questions.indexOf(currentQuestion);

            // Fetch the explanation text
            const explanationText =
              this.explanationTextService.getExplanationTextForQuestionIndex(
                questionIndex
              );

            const questionHasMultipleAnswers =
              this.quizStateService.isMultipleAnswer(currentQuestion);
            
            let correctAnswersText = '';
            if (
              questionHasMultipleAnswers &&
              !isExplanationDisplayed &&
              numberOfCorrectAnswers !== undefined &&
              +numberOfCorrectAnswers > 1
            ) {
              correctAnswersText =
                this.quizQuestionManagerService.getNumberOfCorrectAnswersText(
                  +numberOfCorrectAnswers
                );
            }

            return of({
              questionText: questionText,
              currentQuestion: currentQuestion,
              explanationText: formattedExplanation,
              correctAnswersText: correctAnswersText,
              currentOptions: currentOptions,
              isNavigatingToPrevious: false,
              formattedExplanation: formattedExplanation
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
              formattedExplanation: ''
            });
          }
        }
      )
    );
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
              console.log('questionToDisplay:', questionToDisplay);
              console.log('nextOptions:', nextOptions);
              console.log('explanationText:', explanationText);
              console.log('correctAnswersText:', correctAnswersText);

              const questionText = isNavigatingToPrevious
                ? `${this.previousQuestionText} ${correctAnswersText}`
                : questionToDisplay?.questionText || '';

              return this.explanationTextService.formattedExplanation$.pipe(
                map((formattedExplanation) => ({
                  questionText: questionText,
                  explanationText: formattedExplanation,
                  correctAnswersText: correctAnswersText,
                  currentQuestion: questionToDisplay || null,
                  currentOptions: nextOptions || [],
                  isNavigatingToPrevious: isNavigatingToPrevious
                }))
              );
            }
          )
        )
        .subscribe((combinedData) => {
          this.combinedQuestionData$ = of(combinedData);
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
    this.explanationText$ = this.explanationTextService.explanationText$;
    this.nextExplanationText$ =
      this.explanationTextService.nextExplanationText$;

    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.previousQuestion$,
      this.nextExplanationText$,
      this.explanationTextService.shouldDisplayExplanation$
    ]).pipe(
      switchMap(
        ([
          nextQuestion,
          previousQuestion,
          nextExplanationText,
          shouldDisplayExplanation,
        ]) => {
          if (
            (!nextQuestion || !nextQuestion.questionText) &&
            (!previousQuestion || !previousQuestion.questionText)
          ) {
            return of('');
          } else {
            let textToDisplay = '';

            textToDisplay = shouldDisplayExplanation
              ? this.formattedExplanation || ''
              : this.questionToDisplay || '';

            return of(textToDisplay);
          }
        }
      ),
      startWith('')
    );
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

  async shouldDisplayCorrectAnswersText(data: any): Promise<void> {
    if (!data || !data.currentQuestion) {
      this.shouldDisplayCorrectAnswers = false;
      console.error('Current question is not defined');
      return;
    }

    const currentQuestionHasMultipleAnswers = await this.quizStateService
      .isMultipleAnswer(data.currentQuestion)
      .toPromise();

    const isQuestionDisplayed = !!data.questionText;
    const isExplanationDisplayed = !!data.explanationText;
    const isNavigatingToPrevious = data.isNavigatingToPrevious;

    this.shouldDisplayCorrectAnswers =
      currentQuestionHasMultipleAnswers &&
      isQuestionDisplayed &&
      !isExplanationDisplayed &&
      isNavigatingToPrevious;
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
