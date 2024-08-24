import { AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BehaviorSubject, combineLatest, firstValueFrom, forkJoin, Observable, of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, mergeMap, startWith, switchMap, take, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { CombinedQuestionDataType } from '../../../shared/models/CombinedQuestionDataType.model';
import { Option } from '../../../shared/models/Option.model';
import { QuestionType } from '../../../shared/models/question-type.enum';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { SelectedOptionService } from '../../../shared/services/selectedoption.service';

@Component({
  selector: 'codelab-quiz-content',
  templateUrl: './codelab-quiz-content.component.html',
  styleUrls: ['./codelab-quiz-content.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizContentComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() combinedQuestionData$: Observable<CombinedQuestionDataType> | null = null;
  @Input() currentQuestion: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  @Input() explanationToDisplay: string;
  @Input() questionToDisplay: string;
  @Input() question!: QuizQuestion;
  @Input() question$: Observable<QuizQuestion | null>;
  @Input() questions: QuizQuestion[];
  @Input() options!: Option[];
  @Input() options$: Observable<Option[]>;
  @Input() quizId = '';
  @Input() correctAnswersText = '';
  shouldDisplayCorrectAnswers = false;
  private shouldDisplayCorrectAnswersSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  shouldDisplayCorrectAnswers$ = this.shouldDisplayCorrectAnswersSubject.asObservable();
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
  private isExplanationDisplayed$ = new BehaviorSubject<boolean>(false);
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

  public displayCorrectAnswersText$: Observable<string | null>;

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;
  explanationTexts: string[] = [];

  private correctAnswersDisplaySubject = new Subject<boolean>();
  correctAnswersDisplay$ = this.correctAnswersDisplaySubject.asObservable();

  shouldDisplayNumberCorrectText$: Observable<boolean>;

  questionRendered: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false); // Use BehaviorSubject

  combinedText$: Observable<string>;
  textToDisplay = '';

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
    console.log('ngOnInit triggered in CodelabQuizContentComponent');
    this.explanationTextService.formattedExplanation$.subscribe(explanationText => {
      console.log('formattedExplanation$ emitted::::>>>>', explanationText);
    });

    this.isExplanationDisplayed = false;
    this.explanationTextService.setIsExplanationTextDisplayed(false);

    // Initialize quizId
    this.initializeQuizId();
  
    // Load quiz data from the route first
    this.loadQuizDataFromRoute();
    
    // Initialize other component states and subscriptions
    this.initializeComponent();
    this.initializeQuestionState();
    this.initializeSubscriptions();
    this.setupCombinedTextObservable();
    this.configureDisplayLogic();
    this.setupCorrectAnswersTextDisplay();
  }

  ngAfterViewChecked(): void {
    if (this.currentQuestion && !this.questionRendered.getValue()) {
      this.questionRendered.next(false);
      this.initializeExplanationTextObservable();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.correctAnswersTextSource.complete();
    this.correctAnswersDisplaySubject.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.formattedExplanationSubscription?.unsubscribe();
  }

  private initializeExplanationTextObservable(): void {
    combineLatest([
      this.quizStateService.currentQuestion$,
      this.explanationTextService.isExplanationTextDisplayed$
    ]).pipe(
      takeUntil(this.destroy$),
      withLatestFrom(this.questionRendered), // Ensure questionRendered is true
      switchMap(([[question, isDisplayed], rendered]) => {
        if (question && isDisplayed && rendered) {
          return this.fetchExplanationTextAfterRendering(question);
        } else {
          return of('');
        }
      })
    ).subscribe((explanation: string) => {
      this.explanationToDisplay = explanation;
      this.isExplanationDisplayed = !!explanation;
    });
  }

  private fetchExplanationTextAfterRendering(question: QuizQuestion): Observable<string> {
    return new Observable<string>((observer) => {
      setTimeout(() => {
        this.fetchExplanationText(question).subscribe((explanation: string) => {
          observer.next(explanation);
          observer.complete();
        });
      }, 100); // Delay to ensure rendering order
    });
  }

  configureDisplayLogic(): void {
    this.handleQuestionDisplayLogic().subscribe(({ combinedData, isMultipleAnswer }) => {
      if (this.currentQuestionType === QuestionType.SingleAnswer) {
        this.shouldDisplayCorrectAnswers = false;
      } else {
        this.shouldDisplayCorrectAnswers = isMultipleAnswer;
      }
    });
  }

  private loadQuizDataFromRoute(): void {
    this.activatedRoute.paramMap.subscribe(async params => {
      const quizId = params.get('quizId');
      const questionIndex = params.get('questionIndex') ? +params.get('questionIndex') : 1;
      const zeroBasedIndex = questionIndex - 1;
      
      if (quizId) {
        this.quizId = quizId;
        this.quizService.quizId = quizId;
        localStorage.setItem('quizId', quizId); // Store quizId in localStorage
        this.currentQuestionIndexValue = zeroBasedIndex;
        await this.loadQuestion(quizId, zeroBasedIndex);
      } else {
        console.error('Quiz ID is missing from route parameters');
      }
    });

    this.currentQuestion.pipe(
      debounceTime(200),
      tap((question: QuizQuestion | null) => {
        if (question) {
          this.updateCorrectAnswersDisplay(question).subscribe();
        }
      })
    ).subscribe();
  }

  private async loadQuestion(quizId: string, zeroBasedIndex: number): Promise<void> {
    console.log('Loading questions for quizId:', quizId, 'with index:', zeroBasedIndex);

    if (zeroBasedIndex == null || isNaN(zeroBasedIndex)) {
      console.error('Question index is null or undefined');
      return;
    }

    try {
      const questions = await firstValueFrom(this.quizDataService.getQuestionsForQuiz(quizId));
      if (questions && questions.length > 0 && zeroBasedIndex >= 0 && zeroBasedIndex < questions.length) {
        const question = questions[zeroBasedIndex];
        console.log('Loaded question:', question); // Debug log to ensure question is loaded
        this.currentQuestion.next(question); // Use next to update BehaviorSubject
        this.isExplanationDisplayed = false; // Reset explanation display state
        this.explanationToDisplay = '';

        // Reset explanation state
        this.explanationTextService.resetExplanationState();
        this.explanationTextService.resetExplanationText();

        this.quizStateService.setCurrentQuestion(question);

        /* setTimeout(() => {
          this.questionRendered.next(true); // Use BehaviorSubject
          this.initializeExplanationTextObservable();
          // this.fetchExplanationTextAfterRendering(question);
        }, 300); // Ensure this runs after the current rendering cycle
        */
        setTimeout(() => {
          this.fetchExplanationTextAfterRendering(question);
        }, 300); // Adjust delay as necessary
      } else {
        console.error('Invalid question index:', zeroBasedIndex);
      }
    } catch (error) {
      console.error('Error fetching questions for quiz:', error);
    }
  }

  private updateExplanationAfterQuestionRender(question: QuizQuestion): void {
    setTimeout(() => {
      this.explanationTextService.updateExplanationText(question);
    }, 100);
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
  
      const data: [QuizQuestion[], string[]] = await firstValueFrom(
        this.fetchQuestionsAndExplanationTexts(params).pipe(takeUntil(this.destroy$))
      );
      
      const [questions, explanationTexts] = data;
  
      if (!questions || questions.length === 0) {
        console.warn('No questions found');
        return;
      }
  
      this.explanationTexts = explanationTexts;
  
      await Promise.all(
        questions.map(async (question, index) => {
          const explanation = this.explanationTexts[index] || 'No explanation available';
          this.explanationTextService.storeFormattedExplanation(index, explanation, question);
        })
      );
  
      this.initializeCurrentQuestionIndex();
      this.subscribeToCurrentQuestion();
    } catch (error) {
      console.error('Error in initializeQuestionData:', error);
    }
  }

  private fetchQuestionsAndExplanationTexts(params: ParamMap): Observable<[QuizQuestion[], string[]]> {
    this.quizId = params.get('quizId');
    if (!this.quizId) {
      console.warn('No quizId provided in the parameters.');
      return of([[], []] as [QuizQuestion[], string[]]);
    }
  
    return forkJoin([
      this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
        catchError(error => {
          console.error('Error fetching questions:', error);
          return of([] as QuizQuestion[]);
        })
      ),
      this.quizDataService.getAllExplanationTextsForQuiz(this.quizId).pipe(
        catchError(error => {
          console.error('Error fetching explanation texts:', error);
          return of([] as string[]);
        })
      )
    ]).pipe(
      map(([questions, explanationTexts]) => {  
        return [questions, explanationTexts] as [QuizQuestion[], string[]];
      })
    );
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
        }
  
        const shouldDisplayCorrectAnswers = isMultipleAnswer && !explanationDisplayed;
        if (this.shouldDisplayCorrectAnswersSubject.getValue() !== shouldDisplayCorrectAnswers) {
          console.log('Updating shouldDisplayCorrectAnswersSubject to:', shouldDisplayCorrectAnswers);
          this.shouldDisplayCorrectAnswersSubject.next(shouldDisplayCorrectAnswers);
        }
  
        console.log("Should Display Correct Answers:", shouldDisplayCorrectAnswers);
      }),
      map(() => void 0)
    );
  }

  private fetchExplanationText(question: QuizQuestion): Observable<string> {
    if (!question || !question.questionText) {
      console.error('Question is undefined or missing questionText');
      return of('No explanation available');
    }
  
    return this.quizDataService.getQuestionsForQuiz(this.quizId).pipe(
      switchMap((questions: QuizQuestion[]) => {
        if (questions.length === 0) {
          console.error('No questions received from service.');
          return of('No explanation available');
        }
  
        const questionIndex = questions.findIndex(q =>
          q.questionText.trim().toLowerCase() === question.questionText.trim().toLowerCase()
        );
        if (questionIndex < 0) {
          console.error('Current question not found in the questions array.');
          return of('No explanation available');
        }
  
        const explanation = this.explanationTextService.getFormattedExplanationTextForQuestion(questionIndex);
        return of(explanation);
      })
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
      if (this.quizService.areQuestionsEqual(question, this.question)) {
        this.explanationText = explanationText as string;
      } else {
        this.explanationText = null;
      }
    });
  }

  private initializeCombinedQuestionData(): void {
    const currentQuizAndOptions$ = this.combineCurrentQuestionAndOptions();

    currentQuizAndOptions$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: data => {
        console.log("Current Quiz and Options Data", data);
      },
      error: err => console.error('Error combining current quiz and options:', err)
    });

    this.explanationTextService.getFormattedExplanation(this.quizService.getCurrentQuestionIndex()).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (explanation: string) => {
        console.log('Fetched Explanation:::>>>', explanation);
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
        console.log('Data Received for Combination:', {
          currentQuizData,
          numberOfCorrectAnswers,
          isExplanationDisplayed,
          formattedExplanation
        });

        return this.calculateCombinedQuestionData(
          currentQuizData,
          +numberOfCorrectAnswers,
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
      map(data => {
        console.log('Final Combined Question Data (Map):', data);
        return this.constructDisplayText(data);
      }),
      catchError(error => {
        console.error('Error processing combined text:', error);
        return of('Error loading question data');
      })
    );

    this.combinedText$.pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: text => {
        console.log('Combined Text for Display:', text);
      },
      error: err => console.error('Error in combinedText$ subscription:', err)
    });
  }

  private constructDisplayText(data: CombinedQuestionDataType): string {
    let displayText = data.questionText || '';

    if (data.isExplanationDisplayed) {
      if (data.explanationText) {
        displayText += ` ${data.explanationText}`;
      }
    } else if (data.correctAnswersText) {
      // Only append the correct answers text if explanation is not displayed
      displayText += ` ${data.correctAnswersText}`;
    }

    console.log('Final Display Text:', displayText.trim());
    return displayText.trim();
  }

  async initializeQuestionState(): Promise<void> {
    this.subscribeToQuestionState();
    await this.restoreQuestionState();
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

  private combineCurrentQuestionAndOptions(): 
    Observable<{ currentQuestion: QuizQuestion | null, currentOptions: Option[] }> {
    return combineLatest([
      this.quizService.getCurrentQuestion(),
      this.quizService.getCurrentOptions()
    ]).pipe(
      map(([currentQuestion, currentOptions]) => {
        console.log('Current Question:', currentQuestion);
        console.log('Current Options:', currentOptions);

        if (!currentQuestion) {
          return { currentQuestion: null, currentOptions: [] };
        }

        return { currentQuestion, currentOptions: Array.isArray(currentOptions) ? currentOptions : [] };
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

    const { currentQuestion, currentOptions } = currentQuizData;

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
      correctAnswersText: numberOfCorrectAnswers > 0 ? `${numberOfCorrectAnswers} correct answers` : '',
      isExplanationDisplayed: isExplanationDisplayed,
      isNavigatingToPrevious: false
    };

    console.log('Combined Question Data:', combinedQuestionData);

    return of(combinedQuestionData);
  }
  
  handleQuestionDisplayLogic(): Observable<{ combinedData: CombinedQuestionDataType; isMultipleAnswer: boolean }> {
    return this.combinedQuestionData$.pipe(
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
    );
  }  

  private setupCombinedTextObservable(): void {
    this.combinedText$ = combineLatest([
      this.nextQuestion$.pipe(startWith(null)),
      this.previousQuestion$.pipe(startWith(null)),
      this.explanationTextService.formattedExplanation$.pipe(startWith('')),
      this.explanationTextService.shouldDisplayExplanation$.pipe(startWith(false)),
      this.quizStateService.currentQuestionIndex$.pipe(startWith(0))
    ]).pipe(
      switchMap(params => this.determineTextToDisplay(params as [QuizQuestion | null, QuizQuestion | null, string, boolean, number])),
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
        } else if (nextQuestion) {
          textToDisplay = this.questionToDisplay || '';
          this.shouldDisplayCorrectAnswers = !displayExplanation && isMultipleAnswer;
        }
  
        return textToDisplay;
      })
    );
  }

  private setupCorrectAnswersTextDisplay(): void {
    // Combining the logic to determine if the correct answers text should be displayed
    this.shouldDisplayCorrectAnswers$ = combineLatest([
      this.shouldDisplayCorrectAnswers$,
      this.isExplanationDisplayed$
    ]).pipe(
      map(([shouldDisplayCorrectAnswers, isExplanationDisplayed]) =>
        shouldDisplayCorrectAnswers && !isExplanationDisplayed
      )
    );
  
    // Display correctAnswersText only if the above conditions are met
    this.displayCorrectAnswersText$ = this.shouldDisplayCorrectAnswers$.pipe(
      switchMap(shouldDisplay => 
        shouldDisplay ? this.correctAnswersText$ : of(null)
      )
    );
  }

  // Helper function to check if it's a single-answer question with an explanation
  private isSingleAnswerWithExplanation(isMultipleAnswer: boolean, isExplanationDisplayed: boolean): boolean {
    return !isMultipleAnswer && isExplanationDisplayed;
  }

  isCurrentQuestionMultipleAnswer(): Observable<boolean> {
    return this.currentQuestion.pipe(
      take(1), // Take the first value emitted and then complete
      switchMap((question: QuizQuestion) =>
        question ? this.quizStateService.isMultipleAnswerQuestion(question) : of(false)
      )
    );
  }

  private initializeQuizId(): void {
    const quizId = this.quizService.quizId || localStorage.getItem('quizId');
    if (!quizId) {
      console.error('Quiz ID is null or undefined');
      return;
    }
    this.quizId = quizId;
    this.quizService.quizId = quizId;
  }
}