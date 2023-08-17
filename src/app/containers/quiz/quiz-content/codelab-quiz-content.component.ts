import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, merge, Observable, of, Subject, Subscription } from 'rxjs';
import { map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

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

  currentQuestionSubscription: Subscription;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;

  @Input() combinedQuestionData$: Observable<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> | null = null;
  combinedText$: Observable<string>;
  currentDisplayText: string = '';
  displayCorrectAnswers: boolean = false;
  showExplanation: boolean = false;
  isExplanationTextDisplayed: boolean = false;
  displayCorrectAnswersText: boolean;

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

    this.combinedQuestionData$ = combineLatest([
      this.quizService.nextQuestion$,
      this.quizService.nextOptions$,
      this.numberOfCorrectAnswers$
    ]).pipe(
      map(([nextQuestion, nextOptions, numberOfCorrectAnswers]) => {
        return {
          questionText: nextQuestion?.questionText || '',
          correctAnswersText: this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers),
          currentOptions: nextOptions || [],
        };
      })
    );

    // Update the options$ initialization using combineLatest
    this.options$ = combineLatest([this.currentQuestion$, this.currentOptions$]).pipe(
      map(([currentQuestion, currentOptions]) => {
        if (currentQuestion && currentQuestion.options) {
          return currentQuestion.options;
        }
        return [];
      })
    );

    this.quizQuestionManagerService.currentQuestion$.subscribe((question) => {
      if (question) {
        this.currentDisplayText = this.explanationText || question.questionText || '';
      } else {
        this.currentDisplayText = this.explanationText || '';
      }
    });

    this.quizQuestionManagerService.explanationText$.subscribe((explanationText) => {
      this.explanationText = explanationText;

      // Update the currentDisplayText to display either the explanation text or the question text
      this.currentDisplayText = this.explanationText || this.currentQuestion?.getValue()?.questionText || '';
    });

    this.combinedText$ = merge(
      this.explanationText$,
      this.quizStateService.currentQuestion$.pipe(
        map(question => question?.questionText || '')
      )
    );

    this.combinedQuestionData$.subscribe(data => {
      this.displayCorrectAnswersText = 
        this.shouldDisplayNumberOfCorrectAnswersCount() &&
        data?.correctAnswersText &&
        !this.isExplanationTextDisplayed;
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
        const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(question);
        this.numberOfCorrectAnswers$.next(numberOfCorrectAnswers.toString());
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
      this.explanationText$,
      currentQuestionAndOptions$,
      this.numberOfCorrectAnswers$
    ]).pipe(
      map(([explanationText, { currentQuestion, currentOptions }, numberOfCorrectAnswers]) => {
        const questionText = this.getQuestionText(currentQuestion, this.questions);

        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();

        let correctAnswersText = '';
        if (questionHasMultipleAnswers && !explanationText && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }

        const displayText = explanationText || `${questionText} ${correctAnswersText}`;

        return { questionText: questionText, explanationText, correctAnswersText, currentOptions };
      })
    );

    this.combinedQuestionData$.subscribe((data) => {
      const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(data.currentQuestion);
      const correctAnswersText = this.getNumberOfCorrectAnswersText(numberOfCorrectAnswers);

      if (data.explanationText !== undefined) {
        console.log('Updating currentDisplayText with explanation...');
        this.currentDisplayText = data.explanationText;
        this.cdRef.detectChanges();
      } else if (data.questionText !== undefined) {
        console.log('Updating currentDisplayText with question...');
        this.currentDisplayText = `${data.questionText} ${correctAnswersText}`;
        this.cdRef.detectChanges();
      } else {
        console.log('Explanation and question text are both undefined');
      }
    });
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

  calculateNumberOfCorrectAnswers(question: QuizQuestion): number {
    if (question) {
      const numberOfCorrectAnswers = question.options.reduce((count, option) => count + (option.correct ? 1 : 0), 0);
      return numberOfCorrectAnswers;
    } else {
      console.log('Question or options are undefined.');
      return 0;
    }
  }

  shouldDisplayCorrectAnswersText(data: any): boolean {
    return this.shouldDisplayNumberOfCorrectAnswersCount() &&
           data?.correctAnswersText &&
           !this.isExplanationTextDisplayed;
  }
  
  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return (
      question1.questionText === question2.questionText &&
      JSON.stringify(question1.options) === JSON.stringify(question2.options)
    );
  }
}