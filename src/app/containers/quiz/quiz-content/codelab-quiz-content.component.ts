import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, Observable, of, Subject, Subscription } from 'rxjs';
import { map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';
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
  currentQuestionIndexValue: number;
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  currentOptions$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  numberOfCorrectAnswers: number = 0;
  numberOfCorrectAnswers$: BehaviorSubject<string> =
    new BehaviorSubject<string>('0');
  shouldDisplayNumberOfCorrectAnswers: boolean;
  shouldDisplayCorrectAnswers: boolean = false;
  correctAnswersText: string = '';

  currentQuestionSubscription: Subscription;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  
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
  currentDisplayText: string = '';
  displayCorrectAnswers: boolean = false;
  showExplanation: boolean = false;
  isExplanationTextDisplayed: boolean = false;
  nextQuestionText: string = '';
  displayExplanation$: Observable<boolean>;
  isExplanationTextDisplayed$: Observable<boolean>;
  shouldDisplayExplanation$: Observable<boolean>;
  isExplanationDisplayed: boolean = false;
  showNumberOfCorrectAnswersText: boolean = false;
  shouldDisplayCorrectAnswersText$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  displayCorrectAnswersText: boolean = false;

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
    private activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef
  ) {}

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
      // Do something with the explanation text if needed
      // For example, update your component's explanationText property
      this.explanationText = explanationText;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
  }

  private initializeQuestionData(): void {
    this.activatedRoute.paramMap
      .pipe(
        switchMap((params) => {
          this.quizId = params.get('quizId');
          if (this.quizId) {
            return this.quizDataService.getQuestionsForQuiz(this.quizId);
          } else {
            return of(null);
          }
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((questions) => {
        if (questions) {
          this.questions = questions;
          this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
        }
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

    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.currentQuestionSubscription = this.currentQuestion$.subscribe((question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
        this.numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(question.options);
        const correctAnswersText = this.getNumberOfCorrectAnswersText(this.numberOfCorrectAnswers);
        this.correctAnswersTextSource.next(correctAnswersText);

        // this.updateExplanationText(question);
      }
    });
  }

  private updateExplanationText(question: QuizQuestion): void {
    // Combine explanationTextService's observable with selectedOptionExplanation$
    const explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      this.selectedOptionService.selectedOptionExplanation$
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    );
    
    // Subscribe to explanationText$ and update the explanation text accordingly
    explanationText$.subscribe(explanationText => {
      this.explanationText = this.areQuestionsEqual(question, this.question) ? explanationText : null;
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

    /* this.combinedQuestionData$ = combineLatest([
      this.explanationText$,
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$
    ]).pipe(
      switchMap(([explanationText, { currentQuestion, currentOptions }, numberOfCorrectAnswers, isExplanationDisplayed]) => {
        const questionText = this.getQuestionText(currentQuestion, this.questions);
  
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
  
        let correctAnswersText = '';
        if (questionHasMultipleAnswers && !isExplanationDisplayed && !explanationText && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
  
        return this.getExplanationTextForQuestion(currentQuestion).pipe(
          map(explanationTextForQuestion => ({
            questionText: questionText,
            currentQuestion: currentQuestion,
            explanationText: explanationTextForQuestion,
            correctAnswersText: correctAnswersText,
            currentOptions: currentOptions
          }))
        );
      })
    ); */

    /* this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
      this.explanationText$
    ]).pipe(
      switchMap(([{ currentQuestion, currentOptions }, numberOfCorrectAnswers, isExplanationDisplayed, explanationText]) => {
        const questionText = this.getQuestionText(currentQuestion, this.questions);
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
        let correctAnswersText = '';
  
        if (questionHasMultipleAnswers && !isExplanationDisplayed && !explanationText && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
  
        return this.getExplanationTextForQuestion(currentQuestion).pipe(
          map(explanationTextForQuestion => ({
            questionText: questionText,
            currentQuestion: currentQuestion,
            explanationText: explanationTextForQuestion,
            correctAnswersText: correctAnswersText,
            currentOptions: currentOptions
          }))
        );
      })
    ); */

    this.combinedQuestionData$ = combineLatest([
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$,
      this.isExplanationTextDisplayed$,
    ]).pipe(
      switchMap(([{ currentQuestion, currentOptions }, numberOfCorrectAnswers, isExplanationDisplayed]) => {
        const questionText = this.getQuestionText(currentQuestion, this.questions);
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
        let correctAnswersText = '';
  
        if (questionHasMultipleAnswers && !isExplanationDisplayed && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
  
        const questionIndex = this.questions.indexOf(currentQuestion);
        const explanationText = this.explanationTextService.getExplanationForQuestionIndex(questionIndex);
  
        return of({
          questionText: questionText,
          currentQuestion: currentQuestion,
          explanationText: explanationText,
          correctAnswersText: correctAnswersText,
          currentOptions: currentOptions
        });
      })
    );

    this.combinedQuestionData$.subscribe(data => {
      console.log('Combined Question Data:::>>>>>', data);
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
    this.combinedText$ = combineLatest([
      this.nextQuestion$,
      this.explanationText$,
      this.shouldDisplayExplanation$
    ]).pipe(
      switchMap(([nextQuestion, explanationText, shouldDisplayExplanation]) => {
        if (!nextQuestion) {
          return of('');
        }
  
        if (shouldDisplayExplanation && explanationText !== null) {
          this.explanationTextService.setShouldDisplayExplanation(false);
          return of(explanationText);
        }
  
        return of(nextQuestion.questionText);
      })
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
    
    // Determine if it's a multiple-answer question
    const isMultipleAnswer = numberOfCorrectAnswers > 1;
    
    // Determine if the explanation text is displayed
    const isExplanationDisplayed = !!data.explanationText;
    
    // Display the correct answer text only for multiple-answer questions and when explanation is not displayed
    this.displayCorrectAnswersText = isMultipleAnswer && !isExplanationDisplayed;
    
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