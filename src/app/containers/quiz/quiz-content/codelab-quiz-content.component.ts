import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { map, startWith, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
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
export class CodelabQuizContentComponent {
  @Input() currentQuestion: BehaviorSubject<QuizQuestion> =
    new BehaviorSubject<QuizQuestion>(null);
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  quizId: string = '';
  questionIndex: number;
  currentQuestionIndexValue: number;
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  currentOptions$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  questionsWithExplanations: { question: QuizQuestion, explanation: string }[] = [];
  numberOfCorrectAnswers: number = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers: boolean = false;
  correctAnswersText: string = '';

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
  currentDisplayText: string = '';
  displayedText: string = '';
  displayCorrectAnswers: boolean = false;
  showExplanation: boolean = false;
  isExplanationTextDisplayed: boolean = false;
  nextQuestionText: string = '';
  nextExplanationText: string = '';
  nextExplanationText$: Observable<string>;
  displayExplanation$: Observable<boolean>;
  isExplanationTextDisplayed$: Observable<boolean>;
  shouldDisplayExplanation$: Observable<boolean>;
  isExplanationDisplayed: boolean = false;
  showNumberOfCorrectAnswersText: boolean = false;
  shouldDisplayCorrectAnswersText$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  displayCorrectAnswersText: boolean = false;
  explanationDisplayed: boolean = false;

  private shouldDisplayCorrectAnswersSource = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$: Observable<boolean> = this.shouldDisplayCorrectAnswersSource.asObservable();

  shouldDisplayCorrectAnswersAfterQuestion: boolean = false;

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
      this.selectedOptionService.selectedOptionExplanation$
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    );
    
    // Subscribe to explanationText$ if needed
    this.explanationText$.subscribe(explanationText => {
      this.explanationText = explanationText;
    });

    // Subscribe to the selectedOptionExplanation$ observable and store the subscription
    this.selectedOptionSubscription = this.selectedOptionService.selectedOptionExplanation$.subscribe((explanationText) => {
      if (explanationText) {
        this.explanationText = explanationText;
      } else {
        this.explanationText = 'No explanation available.';
      }
    });

    this.quizService.currentQuestionText$
      .subscribe((questionText) => {
        this.currentQuestionText = questionText;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
    this.selectedOptionSubscription.unsubscribe();
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params) => {
          this.quizId = params.get('quizId');
          if (this.quizId) {
            return forkJoin([
              this.quizDataService.getQuestionsForQuiz(this.quizId),
              this.quizDataService.getAllExplanationTextsForQuiz(this.quizId)
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
          explanation: question.explanation || ''
        }));
      
        // Initialize the current question index
        this.quizService.currentQuestionIndex = 0;
      
        // Set the questions
        this.questions = questions;
        this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
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

    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
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

    this.currentQuestionSubscription = this.quizStateService.currentQuestion$.subscribe(async (question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
        this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(question.options);
        const correctAnswersText = this.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
        this.correctAnswersTextSource.next(correctAnswersText);

        const questions: QuizQuestion[] = await this.quizDataService.getQuestionsForQuiz(this.quizId).toPromise();
        console.log('After fetching questions:', questions);

        console.log('Current Question:>', question.questionText);
        console.log('All Questions:>', questions.map(q => q.questionText));

        // Get the index of the current question
        // const questionIndex = questions.indexOf(question);
        const questionIndex = questions.findIndex(q => q.questionText === question.questionText);

        console.log('Question Index:>', questionIndex);

        if (questionIndex !== -1 && questionIndex < questions.length - 1) {
          const nextQuestion = questions[questionIndex + 1];
          const nextExplanationText = nextQuestion.explanation; // Use the explanation from the next question
          this.explanationTextService.setExplanationTextForIndex(questionIndex + 1, nextExplanationText);
        
          console.log('Explanation Texts Object:', this.explanationTextService.explanationTexts);
        
          this.updateExplanationForQuestion(nextQuestion);
        } else {
          console.warn('Current question not found in the questions array.');
        }
      }
    });
    
    this.explanationText$.subscribe(explanationText => {
      this.explanationText = explanationText;
    });    
  }
   
  updateExplanationForQuestion(question: QuizQuestion): void {
    // Combine explanationTextService's observable with selectedOptionExplanation$
    const explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      this.selectedOptionService.selectedOptionExplanation$
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    );
    
    // Subscribe to explanationText$ and update the explanation text accordingly
    explanationText$.subscribe(explanationText => {
      if (this.areQuestionsEqual(question, this.question)) {
        this.explanationText = explanationText;
      } else {
        this.explanationText = null;
      }
    });
  }

  private initializeNextQuestionSubscription(): void {
    this.nextQuestion$ = this.quizService.nextQuestion$.pipe(
      tap((nextQuestion) =>
        console.log('Next question emitted', nextQuestion)
      )
    );

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
          // The async pipe in the template will handle this for you
        } else {
          // Handle the scenario when there are no more questions
          // For example, you can navigate to a different page here
          // this.router.navigate(['/quiz-completed']);
        }
      });
  }

  private initializeExplanationTextSubscription(): void {
    const selectedOptionExplanation$ = this.selectedOptionService.selectedOptionExplanation$;

    this.explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      selectedOptionExplanation$
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    );

    this.explanationTextSubscription = this.explanationText$.subscribe((displayText) => {
      this.quizQuestionManagerService.setExplanationText(displayText);
      this.quizQuestionManagerService.setExplanationDisplayed(!!displayText);
    });
  }

  private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.currentQuestion$.pipe(
      withLatestFrom(this.currentOptions$),
      map(([currentQuestion, currentOptions]) => ({ currentQuestion, currentOptions }))
    );

    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$
    ]).pipe(
      tap(data => console.log('Observable Data:', data)),
      map(([{ currentQuestion, currentOptions }, numberOfCorrectAnswers, isExplanationDisplayed]) => {
        // const questionText = this.getQuestionText(currentQuestion, this.questions);
        // Calculate question text
        const questionText = currentQuestion ? currentQuestion.questionText : '';

        // Get explanation text for the current question's index
        const questionIndex = this.questions.indexOf(currentQuestion);
    
        // Determine which explanation text to display
        // const explanationText = this.explanationTextService.getExplanationTextForIndex(questionIndex);
        const explanationText = isExplanationDisplayed ? this.nextExplanationText : '';
        const explanationToDisplay = isExplanationDisplayed ? explanationText : '';
        
        // Other calculations, e.g., correct answers text
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
        let correctAnswersText = '';
        if (questionHasMultipleAnswers && !isExplanationDisplayed && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
  
        console.log('Question Index:::>>>', questionIndex);
        console.log('Setting explanation text for question:', currentQuestion.questionText);
        console.log('Explanation Text:::>>>', explanationText);
  
        return {
          questionText: questionText,
          currentQuestion: currentQuestion,
          explanationText: explanationText,
          correctAnswersText: correctAnswersText,
          currentOptions: currentOptions
        };
      })
    );
    
    this.combinedQuestionData$.subscribe(data => {
      console.log('Combined Question Data:::>>>>>))))', data);
    });
  }

  private setupExplanationTextSubscription(): void {
    this.quizQuestionManagerService.explanationText$.subscribe(explanationText => {
      this.explanationText = explanationText;
  
      // Update the currentDisplayText only if the explanation text is not empty
      if (this.explanationText) {
        this.currentDisplayText = this.explanationText;
      } else {
        // If explanation text is empty, show the question text
        this.currentDisplayText = this.currentQuestion?.getValue()?.questionText || '';
      }
    });
  }

  private setupCombinedQuestionData(): void {
    const correctAnswersTextOnInit = this.getNumberOfCorrectAnswersText(+this.numberOfCorrectAnswers$.value);

    this.nextQuestion$ = this.quizService.nextQuestion$;
    this.explanationText$ = this.explanationTextService.explanationText$;
    this.shouldDisplayExplanation$ = this.explanationTextService.shouldDisplayExplanation$;

    this.combinedQuestionData$ = combineLatest([
      this.nextQuestion$,
      this.quizService.nextOptions$,
      this.numberOfCorrectAnswers$,
      this.explanationText$
    ]).pipe(
      map(([nextQuestion, nextOptions, numberOfCorrectAnswers, explanationText]) => {
        return {
          questionText: nextQuestion?.questionText || '',
          explanationText: explanationText,
          correctAnswersText: correctAnswersTextOnInit,
          currentQuestion: nextQuestion,
          currentOptions: nextOptions || []
        };
      })
    );
  }

  private setupOptions(): void {
    // Update the options$ initialization using combineLatest
    this.options$ = combineLatest([this.currentQuestion$, this.currentOptions$]).pipe(
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
    this.nextExplanationText$ = this.explanationTextService.nextExplanationText$;
    console.log("NET Observable:", this.nextExplanationText$);

    console.log('Explanation Text Observable:', this.explanationText$);
    console.log('Next Explanation Text Observable:', this.nextExplanationText$);

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

    this.nextExplanationText$.subscribe(
      (explanationText) => {
        console.log("NET Emitted Value:", explanationText);
      },
      (error) => {
        console.error("NET Error:", error);
      }
    );

    this.nextQuestionSubscription = this.nextQuestion$.subscribe((nextQuestion) => {
      if (nextQuestion) {
        // Handle the display of the next question and its explanation text
        
        // Use ExplanationTextService to fetch the explanation text for the next question
        const currentQuestionIndex = this.questionsWithExplanations?.findIndex(
          (item) => item.question === nextQuestion
        );
    
        let nextExplanationText: string;
    
        if (currentQuestionIndex !== -1) {
          // Check if the current question is in the questionsWithExplanations array
          const nextQuestionItem = this.questionsWithExplanations[currentQuestionIndex + 1];
    
          if (nextQuestionItem) {
            nextExplanationText = nextQuestionItem.explanation;
          }
        } else {
          // The current question is not in the questionsWithExplanations array,
          // so fetch the explanation text from your service or source as needed.
          nextExplanationText = this.explanationTextService.getExplanationForQuestionIndex(
            currentQuestionIndex + 1
          ); // Fetch the explanation text for the next question
        }
    
        // Create a question-explanation pair and add it to the array
        const questionWithExplanation = { question: nextQuestion, explanation: nextExplanationText };
        this.questionsWithExplanations.push(questionWithExplanation);
      } else {
        // Handle the end of the quiz or any cleanup
      }
    });

    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.explanationTextService.nextExplanationText$,
      this.explanationTextService.shouldDisplayExplanation$,
      this.quizService.getTotalQuestions()
    ]).pipe(
      switchMap(([nextQuestion, nextExplanationText, shouldDisplayExplanation, totalQuestions]) => {
        if (!nextQuestion || !nextQuestion.questionText) {
          return of('');
        }
    
        // Fetch the current question index from your service or wherever it is stored
        const currentQuestionIndex = this.quizService.getCurrentQuestionIndex();
    
        // Calculate the next question index
        let nextQuestionIndex = currentQuestionIndex + 1;
    
        // Calculate the total questions synchronously
        const totalQuestionsValue = totalQuestions || 0;
    
        if (nextQuestionIndex >= totalQuestionsValue) {
          nextQuestionIndex = -1;
        }
    
        // Fetch the explanation text for the next question based on the index
        const currentExplanation = this.explanationTextService.getExplanationForQuestionIndex(
          currentQuestionIndex
        );
        const nextExplanation = this.explanationTextService.getExplanationForQuestionIndex(
          nextQuestionIndex
        );
    
        console.log('shouldDisplayExplanation:', shouldDisplayExplanation);
    
        // Decide which text to display based on shouldDisplayExplanation
        const textToDisplay = shouldDisplayExplanation
          ? nextExplanationText || nextExplanation || currentExplanation || nextQuestion.questionText
          : nextQuestion.questionText;
    
        console.log('Next Question:', nextQuestion);
        console.log('Next Question Index:', nextQuestionIndex);
        console.log('Explanation Text:::::>>>>>', nextQuestion.explanation);
        console.log('Next Explanation Text:', nextExplanationText);
        console.log('Should Display Explanation:', shouldDisplayExplanation);
        console.log('Text to Display:', textToDisplay);
    
        return of(textToDisplay);
      }),
      startWith('')
    );    
  }
  
  getQuestionText(currentQuestion: QuizQuestion, questions: QuizQuestion[]): string {
    if (currentQuestion && questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        console.log('Comparing questions:', questions[i], currentQuestion);
        if (this.areQuestionsEqual(questions[i], currentQuestion)) {
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
    const numberOfCorrectAnswers = safeOptions.reduce((count, option) => count + (option.correct ? 1 : 0), 0);
    return numberOfCorrectAnswers;
  }

  shouldDisplayCorrectAnswersText(data: any): boolean {
    const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(data.currentOptions);
    const isMultipleAnswer = numberOfCorrectAnswers > 1;
    const isExplanationDisplayed = !!data.explanationText;
    const isQuestionDisplayed = !!data.questionText;

    // Determine if the correct answers text should be displayed
    this.displayCorrectAnswersText = isMultipleAnswer && isQuestionDisplayed && !isExplanationDisplayed;

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
