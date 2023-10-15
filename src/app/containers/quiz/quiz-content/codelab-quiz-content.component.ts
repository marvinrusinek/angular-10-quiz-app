import { ChangeDetectorRef, ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodelabQuizContentComponent {
  @Input() currentQuestion: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  quizId = '';
  questionIndex: number;
  currentQuestionIndexValue: number;
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  currentOptions$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>(
    []
  );
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  questionsWithExplanations: { question: QuizQuestion; explanation: string }[] =
    [];
  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers = false;
  correctAnswersText = '';

  currentQuestionSubscription: Subscription;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  selectedOptionSubscription: Subscription;

  private correctAnswersTextSource = new BehaviorSubject<string>(null);
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;

  @Input() combinedQuestionData$: Observable<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentQuestion: QuizQuestion;
    currentOptions: Option[];
  }> | null = null;
  combinedText$: Observable<string>;
  currentQuestionText: string;
  currentDisplayText = '';
  displayedText = '';
  displayCorrectAnswers = false;
  showExplanation = false;
  isExplanationTextDisplayed = false;
  nextQuestionText = '';
  nextExplanationText = '';
  nextExplanationText$: Observable<string>;
  displayExplanation$: Observable<boolean>;
  isExplanationTextDisplayed$: Observable<boolean>;
  shouldDisplayExplanation$: Observable<boolean>;
  isExplanationDisplayed = false;
  showNumberOfCorrectAnswersText = false;
  shouldDisplayCorrectAnswersText$: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  displayCorrectAnswersText = false;
  explanationDisplayed = false;

  private shouldDisplayCorrectAnswersSource = new BehaviorSubject<boolean>(
    false
  );
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
    private router: Router,
    private cdRef: ChangeDetectorRef
  ) {
    this.explanationTextService.setShouldDisplayExplanation(false);
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

    // Subscribe to explanationText$ if needed
    this.explanationText$.subscribe((explanationText) => {
      this.explanationText = explanationText;
    });

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

    this.quizService.currentQuestionText$.subscribe((questionText) => {
      this.currentQuestionText = questionText;
    });

    this.quizService.nextQuestionText$.subscribe((text) => {
      this.nextQuestionText = text;
    });
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

    this.quizStateService.currentOptions$.subscribe((options) => {
      this.currentOptions$.next(options);
    });

    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        this.options = question.options;
      }
    });

    this.currentOptions$.subscribe((options) => {
      this.options = options;
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

    this.quizStateService.currentOptions$.subscribe((options) => {
      this.options = options;
    });

    this.currentQuestionSubscription =
      this.quizStateService.currentQuestion$.subscribe(
        async (question: QuizQuestion) => {
          if (question) {
            this.quizQuestionManagerService.setCurrentQuestion(question);
            this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(
              question.options
            );
            const correctAnswersText = this.getNumberOfCorrectAnswersText(
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

    this.explanationText$.subscribe((explanationText) => {
      this.explanationText = explanationText;
    });
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
      map(
        ([explanationText, selectedOptionExplanation]) =>
          selectedOptionExplanation || explanationText
      )
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

    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
    ]).pipe(
      tap((data) => console.log('Observable Data:', data)),
      map(
        ([
          { currentQuestion, currentOptions },
          numberOfCorrectAnswers,
          isExplanationDisplayed,
        ]) => {
          // Calculate question text
          const questionText = currentQuestion
            ? this.getQuestionText(currentQuestion, this.questions)
            : '';

          // Get explanation text for the current question's index
          const questionIndex = this.questions.indexOf(currentQuestion);

          // Determine which explanation text to display
          // const explanationText = this.explanationTextService.getExplanationTextForQuestionIndex(questionIndex);
          const explanationText = isExplanationDisplayed
            ? this.nextExplanationText
            : '';

          // Other calculations, e.g., correct answers text
          const questionHasMultipleAnswers =
            this.quizStateService.isMultipleAnswer();
          let correctAnswersText = '';
          if (
            questionHasMultipleAnswers &&
            !isExplanationDisplayed &&
            numberOfCorrectAnswers !== undefined &&
            +numberOfCorrectAnswers > 1
          ) {
            correctAnswersText = this.getNumberOfCorrectAnswersText(
              +numberOfCorrectAnswers
            );
          }

          console.log('Question Index:::>>>', questionIndex);
          console.log(
            'Setting explanation text for question:',
            currentQuestion.questionText
          );
          console.log('Explanation Text:::>>>', explanationText);

          return {
            questionText: questionText,
            currentQuestion: currentQuestion,
            explanationText: explanationText,
            correctAnswersText: correctAnswersText,
            currentOptions: currentOptions,
          };
        }
      )
    );
  }

  private setupExplanationTextSubscription(): void {
    this.quizQuestionManagerService.explanationText$.subscribe(
      (explanationText) => {
        this.explanationText = explanationText;

        // Update the currentDisplayText only if the explanation text is not empty
        if (this.explanationText) {
          this.currentDisplayText = this.explanationText;
        } else {
          // If explanation text is empty, show the question text
          this.currentDisplayText =
            this.currentQuestion?.getValue()?.questionText || '';
        }
      }
    );
  }

  private setupCombinedQuestionData(): void {
    const correctAnswersTextOnInit = this.getNumberOfCorrectAnswersText(
      +this.numberOfCorrectAnswers$.value
    );

    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.explanationText$ = this.explanationTextService.explanationText$;
    this.shouldDisplayExplanation$ =
      this.explanationTextService.shouldDisplayExplanation$;
    this.shouldDisplayExplanation$.subscribe(value => {
      console.log('shouldDisplayExplanation$ changed to', value);
    });
    this.cdRef.detectChanges();
      
    this.combinedQuestionData$ = combineLatest([
      this.nextQuestion$,
      this.quizService.nextOptions$,
      this.explanationText$,
    ]).pipe(
      map(([nextQuestion, nextOptions, explanationText]) => {
        return {
          questionText: nextQuestion?.questionText || '',
          explanationText: explanationText,
          correctAnswersText: correctAnswersTextOnInit,
          currentQuestion: nextQuestion || null,
          currentOptions: nextOptions || [],
        };
      })
    );
  }

  private setupOptions(): void {
    // Update the options$ initialization using combineLatest
    this.options$ = combineLatest([
      this.currentQuestion$,
      this.currentOptions$,
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

    this.explanationTextService.explanationText$.subscribe(
      (currentExplanationText) => {
        console.log('Current Explanation Text::>>', currentExplanationText);
        this.explanationText = currentExplanationText;
      }
    );

    this.explanationTextService.nextExplanationText$.subscribe(
      (nextExplanationText) => {
        console.log('Next Explanation Text::>>', nextExplanationText);
        this.nextExplanationText = nextExplanationText;
      }
    );

    this.nextQuestionSubscription = this.nextQuestion$.subscribe(
      (nextQuestion) => {
        if (nextQuestion) {
          // Handle the display of the next question and its explanation text

          // Log when a new question is encountered
          console.log("New question emitted:", nextQuestion);

          // Use ExplanationTextService to fetch the explanation text for the next question
          const currentQuestionIndex =
            this.questionsWithExplanations?.findIndex(
              (item) => item.question === nextQuestion
            );

          console.log("Content of questionsWithExplanations array:", this.questionsWithExplanations);

          let nextExplanationText: string;

          if (currentQuestionIndex !== -1) {
            // Check if the current question is in the questionsWithExplanations array
            const nextQuestionItem =
              this.questionsWithExplanations[currentQuestionIndex + 1];

            if (nextQuestionItem) {
              nextExplanationText = nextQuestionItem.explanation;
            }
          } else {
            // The current question is not in the questionsWithExplanations array,
            // so fetch the explanation text from the service or source as needed
            nextExplanationText =
              this.explanationTextService.getExplanationTextForQuestionIndex(
                currentQuestionIndex + 1
              ); // fetch the explanation text for the next question
          }

          // Create a question-explanation pair and add it to the array
          const questionWithExplanation = {
            question: nextQuestion,
            explanation: nextExplanationText,
          };
          this.questionsWithExplanations.push(questionWithExplanation);
        } else {
          // Handle the end of the quiz or any cleanup
        }
      }
    );

    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.explanationTextService.nextExplanationText$,
      this.explanationTextService.shouldDisplayExplanation$,
      this.quizService.getTotalQuestions()
    ]).pipe(
      switchMap(
        ([
          nextQuestion,
          nextExplanationText,
          shouldDisplayExplanation,
          totalQuestions
        ]) => {
          console.log("SDE", shouldDisplayExplanation);
          console.log("NQ", nextQuestion);
          if (!nextQuestion || !nextQuestion.questionText) {
            return of('');
          }

          // Fetch the current question index from your service or wherever it is stored
          const currentQuestionIndex =
            this.quizService.getCurrentQuestionIndex();

          // Calculate the next question index
          let nextQuestionIndex = currentQuestionIndex + 1;

          // Calculate the total questions synchronously
          const totalQuestionsValue = totalQuestions || 0;

          console.log('NQI', nextQuestionIndex);
          console.log('TQV', totalQuestionsValue);

          // Fetch the explanation text for the next question based on the index
          const currentExplanation =
            this.explanationTextService.getExplanationTextForQuestionIndex(
              currentQuestionIndex
            );
          const nextExplanation =
            this.explanationTextService.getExplanationTextForQuestionIndex(
              nextQuestionIndex
            );

          console.log('shouldDisplayExplanation:', shouldDisplayExplanation);
          console.log('Current Question Index:', currentQuestionIndex);
          console.log('Next Question Index:', nextQuestionIndex);
          console.log('Total Questions:', totalQuestionsValue);
          console.log('Current Explanation:', currentExplanation);
          console.log('Next Explanation:', nextExplanation);

          let textToDisplay = '';
          if (shouldDisplayExplanation === true) {
            textToDisplay =
              nextExplanationText ||
              nextExplanation ||
              currentExplanation ||
              '';
          } else {
            textToDisplay = nextQuestion.questionText || '';
          }

          // Inside the switchMap function:
          console.log(
            'Next Question Text (After Fetching):',
            nextQuestion.questionText
          );

          console.log('Text to Display:', textToDisplay);

          return of(textToDisplay);
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

  getNumberOfCorrectAnswersText(
    numberOfCorrectAnswers: number | undefined
  ): string {
    if (numberOfCorrectAnswers === undefined) {
      return '';
    }

    const correctAnswersText =
      numberOfCorrectAnswers === 1
        ? `(${numberOfCorrectAnswers} answer is correct)`
        : `(${numberOfCorrectAnswers} answers are correct)`;

    return correctAnswersText;
  }

  calculateNumberOfCorrectAnswers(options: Option[]): number {
    const safeOptions = options ?? [];
    const numberOfCorrectAnswers = safeOptions.reduce(
      (count, option) => count + (option.correct ? 1 : 0),
      0
    );
    return numberOfCorrectAnswers;
  }

  shouldDisplayCorrectAnswersText(data: any): boolean {
    const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(
      data.currentOptions
    );
    const isMultipleAnswer = numberOfCorrectAnswers > 1;
    const isExplanationDisplayed = !!data.explanationText;
    const isQuestionDisplayed = !!data.questionText;

    // Determine if the correct answers text should be displayed
    this.displayCorrectAnswersText =
      isMultipleAnswer && isQuestionDisplayed && !isExplanationDisplayed;

    return this.displayCorrectAnswersText;
  }

  getNumberOfCorrectAnswers(data: any): number {
    const correctAnswers = data?.correctAnswers || [];
    console.log('Correct Answers:', correctAnswers);
    return correctAnswers.length;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return isEqual(question1, question2);
  }
}
