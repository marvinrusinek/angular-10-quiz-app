import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, EMPTY, finalize, map, mergeMap, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { Quiz } from '../../../shared/models/Quiz.model';
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
export class CodelabQuizContentComponent implements OnInit, OnDestroy {
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() correctAnswersText = '';
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();
  quizId = '';
  questionIndex: number;
  questionText = '';
  currentQuestionIndexValue: number;
  currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  currentOptions$: BehaviorSubject<Option[] | null> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  previousQuestion$: Observable<QuizQuestion | null>;
  isNavigatingToPrevious: boolean;
  currentQuestionType: QuestionType;

  displayCorrectAnswers = false;
  explanationDisplayed = false;
  isExplanationDisplayed = false;
  isExplanationTextDisplayed = false;
  isExplanationTextDisplayed$: Observable<boolean>;
  nextExplanationText = '';
  formattedExplanation = '';
  formattedExplanation$: BehaviorSubject<string> = new BehaviorSubject<string>('');

  numberOfCorrectAnswers = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> = new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;

  currentQuestionSubscription: Subscription;
  formattedExplanationSubscription: Subscription;

  correctAnswersTextSource: BehaviorSubject<string> = new BehaviorSubject<string>('');
  correctAnswersText$ = this.correctAnswersTextSource.asObservable();

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;
  explanationTexts: string[] = [];

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  combinedText$: Observable<string>;
  textToDisplay = '';

  previousIndex: number | null = null; // to track if the index has changed, not being used, might remove...

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

    this.isExplanationTextDisplayed$ = this.explanationTextService.isExplanationTextDisplayed$;

    this.isExplanationTextDisplayed$.subscribe(isDisplayed => {
      console.log('isExplanationTextDisplayed updated to:', isDisplayed);
      this.isExplanationDisplayed = isDisplayed;
  
      if (isDisplayed) {
        this.correctAnswersTextSource.next(''); // Clear correct answers text
        console.log('Explanation is displayed, resetting correctAnswersTextSource.');
      } else {
        console.log('Explanation is not displayed, current correct answers text:', this.correctAnswersTextSource.getValue());
      }
    });
  }

  ngOnInit(): void {
    // Initialize isExplanationDisplayed to false initially
    this.isExplanationDisplayed = false;
    this.explanationTextService.setIsExplanationTextDisplayed(false);
    console.log('Initialization: isExplanationDisplayed set to false');

    this.loadQuizDataFromRoute();
    this.initializeComponent();
    this.initializeCurrentQuizAndQuestion();
    this.initializeQuestionState();
    this.initializeSubscriptions();
    this.setupCombinedTextObservable(); 
    this.handleQuestionDisplayLogic(); // remove?
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.correctAnswersTextSource.complete();
    this.correctAnswersDisplaySubject.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
  }

  loadQuizDataFromRoute(): void {
    this.activatedRoute.paramMap.subscribe(params => {
      this.quizId = params.get('quizId');
      const questionIndex = +params.get('questionIndex');
      const zeroBasedIndex = questionIndex - 1;
      this.loadQuestion(this.quizId, zeroBasedIndex);
    });

    this.currentQuestion.pipe(
      debounceTime(200),
      tap((question: QuizQuestion | null) => {
        this.updateCorrectAnswersDisplay(question).subscribe();
      })
    ).subscribe();
  }

  private loadQuestion(quizId: string, zeroBasedIndex: number): void {
    this.quizDataService.getQuestionsForQuiz(quizId).subscribe(questions => {
      if (questions && questions.length > 0 && zeroBasedIndex >= 0 && zeroBasedIndex < questions.length) {
        const question = questions[zeroBasedIndex];
        this.currentQuestion.next(question);

        this.isExplanationDisplayed = false; // Reset explanation display state

        // Reset explanation state
        this.explanationTextService.resetExplanationState();
        this.explanationTextService.resetExplanationText();

        // Ensure isExplanationTextDisplayed$ is defined before subscribing
        if (this.isExplanationTextDisplayed$) {
          this.updateCorrectAnswersDisplay(question).subscribe(() => {
            // Fetch and display explanation text
            this.fetchAndDisplayExplanationText(question);
          });

          // Subscribe to isExplanationTextDisplayed$
          this.isExplanationTextDisplayed$.pipe(distinctUntilChanged()).subscribe((isDisplayed: boolean) => {
            this.isExplanationDisplayed = isDisplayed;
            if (isDisplayed) {
              this.correctAnswersTextSource.next('');
            }
          });
        } else {
          console.error('isExplanationTextDisplayed$ is not initialized.');
        }
      } else {
        console.error('Invalid question index:', zeroBasedIndex);
      }
    });
  }


  initializeSubscriptions(): void {
    this.initializeQuestionIndexSubscription();
    this.initializeResetQuizSubscription();
    this.initializeExplanationDisplaySubscription();
    this.initializeExplanationTextSubscription();
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
    });
  }

  private initializeComponent(): void {
    this.initializeQuestionData();
    this.initializeCombinedQuestionData();
  }
  
  private async initializeQuestionData(): Promise<void> {
    try {
      const params: ParamMap = await firstValueFrom(this.activatedRoute.paramMap.pipe(take(1)));
  
      // Fetch questions and explanations
      const result: [QuizQuestion[], string[]] = await firstValueFrom(
        this.fetchQuestionsAndExplanationTexts(params).pipe(takeUntil(this.destroy$))
      );
  
      const [questions, explanationTexts] = result;
  
      if (!questions || questions.length === 0) {
        console.warn('No questions found');
        return;
      }
  
      this.explanationTexts = explanationTexts;
      console.log("Fetched Explanation Texts:", this.explanationTexts);
  
      const formattedExplanations = await Promise.all(
        questions.map(async (question, index) => {
          const explanation = this.explanationTexts[index] || 'No explanation available';
          return { questionIndex: index, explanation };
        })
      );
  
      console.log('Formatted Explanations:', formattedExplanations);
  
      this.explanationTextService.initializeFormattedExplanations(formattedExplanations);
      this.initializeCurrentQuestionIndex();
      this.subscribeToCurrentQuestion();
    } catch (error) {
      console.error('Error in initializeQuestionData:', error);
    }
  }

  private fetchQuestionsAndExplanationTexts(params: ParamMap): Observable<[QuizQuestion[], string[]]> {
    this.quizId = params.get('quizId');
    
    if (this.quizId) {
      return forkJoin([
        this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
          catchError(error => {
            console.error('Error fetching questions:', error);
            return of([]); // Return an empty array if an error occurs
          })
        ),
        this.quizDataService.getAllExplanationTextsForQuiz(this.quizId).pipe(
          catchError(error => {
            console.error('Error fetching explanation texts:', error);
            return of([]); // Return an empty array if an error occurs
          })
        )
      ]).pipe(
        map(([questions, explanationTexts]) => {
          if (!questions.length) {
            console.warn('No questions found for the provided quizId.');
          }
          return [questions, explanationTexts];
        })
      );
    } else {
      console.warn('No quizId provided in the parameters.');
      return of([[], []]);
    }
  }

  private initializeCurrentQuestionIndex(): void {
    this.quizService.currentQuestionIndex = 0;
    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
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

  private processCurrentQuestion(question: QuizQuestion): void {
    // Update question details and display correct answers
    this.updateQuestionDetailsAndDisplayCorrectAnswers(question);

    // Determine if correct answers count should be displayed
    this.handleCorrectAnswersDisplay(question);
  }

  // Function to update question details and display correct answers
  private updateQuestionDetailsAndDisplayCorrectAnswers(question: QuizQuestion): void {
    this.quizQuestionManagerService.updateCurrentQuestionDetail(question);
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

  /* private updateCorrectAnswersDisplay(question: QuizQuestion | null): Observable<void> {
    if (!question) {
      return of(void 0);
    }

    return this.quizStateService.isMultipleAnswerQuestion(question).pipe(
      tap(isMultipleAnswer => {
        const correctAnswers = question.options.filter(option => option.correct).length;
        let newCorrectAnswersText = '';

        const explanationDisplayed = this.explanationTextService.isExplanationTextDisplayedSource.getValue();
        console.log('Evaluating conditions:', {
          isMultipleAnswer,
          isExplanationDisplayed: explanationDisplayed
        });

        if (isMultipleAnswer && !explanationDisplayed) {
          newCorrectAnswersText = `(${correctAnswers} answers are correct)`;
        } else {
          newCorrectAnswersText = ''; // Clear text if explanation is displayed
        }

        if (this.correctAnswersTextSource.getValue() !== newCorrectAnswersText) {
          this.correctAnswersTextSource.next(newCorrectAnswersText);
          console.log('Updated correct answers text to:', newCorrectAnswersText);
        }

        const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
          console.log('Updating shouldDisplayCorrectAnswersSubject to:', shouldDisplayCorrectAnswers);
          this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
        }

        console.log("Correct Answers Text for Display:", newCorrectAnswersText);
        console.log("Should Display Correct Answers:", shouldDisplayCorrectAnswers);
      }),
      map(() => void 0)
    );
  } */

  /* private updateCorrectAnswersDisplay(question: QuizQuestion | null): Observable<void> {
    if (!question) {
      return of(void 0);
    }
  
    return this.quizStateService.isMultipleAnswerQuestion(question).pipe(
      tap(isMultipleAnswer => {
        const explanationDisplayed = this.explanationTextService.isExplanationTextDisplayedSource.getValue();
        const correctAnswers = question.options.filter(option => option.correct).length;
  
        let newCorrectAnswersText = '';
        if (isMultipleAnswer && !explanationDisplayed) {
          newCorrectAnswersText = `(${correctAnswers} answers are correct)`;
        }
  
        console.log('Current Explanation Display State:', explanationDisplayed);
        console.log('Is Multiple Answer:', isMultipleAnswer);
        console.log('Correct Answers Text:', newCorrectAnswersText);
  
        this.correctAnswersTextSource.next(newCorrectAnswersText);
      }),
      map(() => void 0)
    );
  } */

  private updateCorrectAnswersDisplay(question: QuizQuestion | null): Observable<void> {
    if (!question) {
      return of(void 0);
    }
  
    return this.quizStateService.isMultipleAnswerQuestion(question).pipe(
      tap(isMultipleAnswer => {
        const correctAnswers = question.options.filter(option => option.correct).length;
        let newCorrectAnswersText = '';
  
        const explanationDisplayed = this.explanationTextService.isExplanationTextDisplayedSource.getValue();
        console.log('Evaluating conditions:', {
          isMultipleAnswer,
          isExplanationDisplayed: explanationDisplayed
        });
  
        if (isMultipleAnswer && !explanationDisplayed) {
          newCorrectAnswersText = `(${correctAnswers} answers are correct)`;
        } else {
          newCorrectAnswersText = ''; // Clear text if explanation is displayed
        }
  
        if (this.correctAnswersTextSource.getValue() !== newCorrectAnswersText) {
          this.correctAnswersTextSource.next(newCorrectAnswersText);
          console.log('Updated correct answers text to:', newCorrectAnswersText);
        }
  
        const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
          console.log('Updating shouldDisplayCorrectAnswersSubject to:', shouldDisplayCorrectAnswers);
          this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
        }
  
        console.log("Correct Answers Text for Display:", newCorrectAnswersText);
        console.log("Should Display Correct Answers:", shouldDisplayCorrectAnswers);
      }),
      map(() => void 0)
    );
  }  

  private async fetchAndDisplayExplanationText(question: QuizQuestion): Promise<void> {
    if (!question || !question.questionText) {
      console.error('Question is undefined or missing questionText');
      return;
    }

    try {
      const data = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(this.quizId));
      const questions: QuizQuestion[] = data;

      if (questions.length === 0) {
        console.error('No questions received from service.');
        return;
      }

      const questionIndex = questions.findIndex((q) =>
        q.questionText.trim().toLowerCase() === question.questionText.trim().toLowerCase()
      );
      if (questionIndex < 0) {
        console.error('Current question not found in the questions array.');
        return;
      }

      const currentQuestion = questions[questionIndex];
      if (this.quizService.isValidQuizQuestion(currentQuestion)) {
        this.currentQuestion.next(currentQuestion);

        if (questionIndex < questions.length - 1) {
          const nextQuestion = questions[questionIndex + 1];
          if (nextQuestion) {
            this.setExplanationForNextQuestion(questionIndex + 1, nextQuestion);
            this.updateExplanationForQuestion(nextQuestion);

            // Set explanation display state
            this.isExplanationDisplayed = true;
            this.explanationTextService.setIsExplanationTextDisplayed(true);
            this.correctAnswersTextSource.next(''); // Clear correct answers text
          } else {
            console.warn('Next question not found in the questions array.');
          }
        } else {
          console.warn('Current question is the last question in the array.');
        }

        // Set explanation display state
        this.isExplanationDisplayed = true;
        this.explanationTextService.setIsExplanationTextDisplayed(true);
        this.correctAnswersTextSource.next(''); // Clear correct answers text
      } else {
        console.error("Current question is not valid");
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
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
    const currentQuizAndOptions$ = this.combineCurrentQuestionAndOptions();

    currentQuizAndOptions$.subscribe({
      next: data => {
        console.log("CQAO data", data);
      },
      error: err => console.error('Error combining current quiz and options:', err)
    });

    this.explanationTextService.getFormattedExplanation(this.quizService.getCurrentQuestionIndex()).subscribe({
      next: explanation => {
        this.formattedExplanation$.next(explanation);
      },
      error: err => {
        console.error('Error fetching formatted explanation:', err);
        this.formattedExplanation$.next('Error fetching explanation');
      }
    });

    this.combinedQuestionData$ = combineLatest([
      currentQuizAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
      this.formattedExplanation$
    ]).pipe(
      switchMap(([currentQuizData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation]) => {
        console.log('initializeCombinedQuestionData - combinedLatest values:', currentQuizData, numberOfCorrectAnswers, isExplanationDisplayed, formattedExplanation);

        return this.calculateCombinedQuestionData(
          currentQuizData, 
          numberOfCorrectAnswers, 
          isExplanationDisplayed, 
          formattedExplanation
        );
      }),
      catchError((error: Error) => {
        console.error('Error combining quiz data:', error);
        return of({
          currentQuestion: null,
          currentOptions: [],
          options: [],
          questionText: '',
          explanationText: '',
          correctAnswersText: '',
          isExplanationDisplayed: false,
          isNavigatingToPrevious: false
        } as CombinedQuestionDataType);
      })
    );

    this.combinedText$ = this.combinedQuestionData$.pipe(
      map(data => this.constructDisplayText(data)),
      catchError(error => {
        console.error('Error processing combined text:', error);
        return of('Error loading question data');
      })
    );
  }
  
  private constructDisplayText(data: CombinedQuestionDataType): string {
    console.log('Constructing Display Text with Data:', data);
    let displayText = data.questionText || '';

    if (data.isExplanationDisplayed && data.explanationText) {
        displayText += ` ${data.explanationText}`;
        console.log("Explanation Displayed, no correct answers text.");
    } else if (!data.isExplanationDisplayed && data.correctAnswersText) {
        displayText += ` (${data.correctAnswersText})`;
        console.log("Displaying correct answers text:", data.correctAnswersText);
    } else {
        console.log("Neither explanation nor correct answers text is displayed.");
    }

    return displayText.trim(); // Ensure no trailing spaces
  }

  async initializeQuestionState(): Promise<void> {
    await this.restoreQuestionState();
    this.subscribeToQuestionState();
  }

  async restoreQuestionState(): Promise<void> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, this.currentQuestionIndexValue);
    if (questionState) {
      const isQuestionAnswered = questionState.isAnswered;
      if (isQuestionAnswered) {
        this.quizService.displayExplanation = true;
        this.explanationText = await firstValueFrom(this.explanationTextService.getExplanationTextForQuestionIndex(this.currentQuestionIndexValue));
      }
      this.numberOfCorrectAnswers = questionState.numberOfCorrectAnswers;
    }
  }
  
  subscribeToQuestionState(): void {
    this.quizService.getCurrentQuestionIndexObservable().subscribe(async currentIndex => {
      const quizId = this.quizService.getCurrentQuizId();
      const questionId = this.quizService.getQuestionIdAtIndex(currentIndex);
      const state = this.quizStateService.getQuestionState(quizId, questionId);
    
      if (state && state.isAnswered) {
        this.explanationToDisplay = this.explanationTexts[currentIndex]; // Access the stored explanation text
      } else {
        this.explanationToDisplay = '';
      }
    });
  }

  private initializeCurrentQuizAndQuestion(): void {
    // Fetch the current question
    this.quizService.getCurrentQuestion().subscribe(question => {
      if (question) {
        this.currentQuestion$.next(question);
      } else {
        console.error('No current question available');
        this.currentQuestion$.next(null);
      }
    });

    // Fetch the current options
    this.quizService.getCurrentOptions().subscribe(options => {
      this.currentOptions$.next(options);
    });
  }
  
  private combineCurrentQuestionAndOptions(): Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
    return combineLatest([
        this.quizService.getCurrentQuiz(),
        this.quizService.getCurrentOptions()
    ]).pipe(
        map(([currentQuiz, currentOptions]) => {
            if (!currentQuiz || !currentQuiz.questions) {
                console.error('No current quiz or questions found in data:', currentQuiz);
                return { currentQuestion: null, currentOptions: [] };
            }
            const currentQuestionIndex = this.quizService.getCurrentQuestionIndex();
            const currentQuestion = currentQuiz.questions[currentQuestionIndex] || null;
            return { currentQuestion, currentOptions };
        }),
        catchError(error => {
            console.error('Error combining current question and options:', error);
            return of({ currentQuestion: null, currentOptions: [] });
        })
    );  
  }
  
  private calculateCombinedQuestionData(
    currentQuizData: any,
    numberOfCorrectAnswers: number,
    isExplanationDisplayed: boolean,
    formattedExplanation: string
): Observable<CombinedQuestionDataType> {
    console.log('Calculating Combined Question Data with:', {
        currentQuizData,
        numberOfCorrectAnswers,
        isExplanationDisplayed,
        formattedExplanation
    });

    const currentQuestion = currentQuizData.currentQuestion;
    const currentOptions = currentQuizData.currentOptions;

    if (!currentQuestion) {
        console.error('No current question found in data:', currentQuizData);
        return of({
            currentQuestion: null,
            currentOptions: [],
            options: [],
            questionText: '',
            explanationText: '',
            correctAnswersText: '',
            isExplanationDisplayed: false,
            isNavigatingToPrevious: false
        });
    }

    const combinedQuestionData: CombinedQuestionDataType = {
        currentQuestion: currentQuestion,
        currentOptions: currentOptions,
        options: currentOptions,
        questionText: currentQuestion.questionText,
        explanationText: isExplanationDisplayed ? formattedExplanation : '',
        correctAnswersText: !isExplanationDisplayed && numberOfCorrectAnswers > 0 ? `${numberOfCorrectAnswers} correct answers` : '',
        isExplanationDisplayed: isExplanationDisplayed,
        isNavigatingToPrevious: false
    };

    console.log('Combined Question Data:', combinedQuestionData);

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
      this.explanationTextService.shouldDisplayExplanation$,
      this.quizStateService.getCurrentQuestionIndex$().pipe(startWith(0))
    ]).pipe(
      switchMap(params => this.determineTextToDisplay(params)),
      distinctUntilChanged(),
      startWith(''),
      catchError((error: Error) => {
        console.error('Error in combinedText$ observable:', error);
        return of('');
      })
    );
  }
  
  private determineTextToDisplay(
    [nextQuestion, previousQuestion, formattedExplanation, shouldDisplayExplanation, currentIndex]:
    [QuizQuestion | null, QuizQuestion | null, string, boolean, number]
  ): Observable<string> {
    const questionState = this.quizStateService.getQuestionState(this.quizId, currentIndex);
  
    const displayExplanation = currentIndex === 0 || (shouldDisplayExplanation && questionState?.explanationDisplayed);
  
    return this.isCurrentQuestionMultipleAnswer().pipe(
      map(isMultipleAnswer => {
        let textToDisplay = '';
  
        if (displayExplanation && formattedExplanation) {
          textToDisplay = formattedExplanation;
          this.shouldDisplayCorrectAnswers = false;
        } else {
          textToDisplay = this.questionToDisplay || '';
          this.shouldDisplayCorrectAnswers = !displayExplanation && isMultipleAnswer;
        }
  
        console.log('Text to Display:', textToDisplay);
        return textToDisplay;
      })
    );
  }
    
  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap((question: QuizQuestion) =>
        question ? this.quizStateService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }

  // Helper function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }
}

