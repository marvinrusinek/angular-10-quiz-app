import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, Observable, of, Subject, Subscription } from 'rxjs';
import { filter, map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';

 
@Component({
  selector: 'codelab-quiz-cp-component',
  templateUrl: './codelab-quiz.component.html',
  styleUrls: ['./codelab-quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizComponent { 
  @Input() currentQuestion: BehaviorSubject<QuizQuestion> = new BehaviorSubject<QuizQuestion>(null);
  @Input() question: QuizQuestion;
  @Input() questions: QuizQuestion[];
  @Input() options: Option[] = [];
  quizId: string = '';
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  // currentOptions$: Observable<Option[]> = this.quizService.options$;
  currentOptions$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  // explanationText$: Observable<string>;
  // options$: Observable<string[]>;
  options$: Observable<Option[]>; 
  currentQuestionIndex$: Observable<number>;
  nextQuestion$: Observable<QuizQuestion | null>;
  numberOfCorrectAnswers: number = 0;
  // numberOfCorrectAnswers$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  shouldDisplayNumberOfCorrectAnswers: boolean;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  currentQuestionIndexValue: number;
  numberOfCorrectAnswers$: BehaviorSubject<string> = new BehaviorSubject<string>('0');
  combinedQuestionData$: Observable<{ questionText: string; correctAnswersText?: string }>;
  combinedDataSubject$: BehaviorSubject<{ questionText: string; correctAnswersText: string }> = new BehaviorSubject({ questionText: '', correctAnswersText: '' });

  // private explanationTextSubject$ = new BehaviorSubject<string | null>(null);
  // private currentQuestionSubject$ = new BehaviorSubject<any | null>(null);

  private explanationTextSubject = new BehaviorSubject<string>('');
  private currentQuestionSubject = new BehaviorSubject<string>('');
  private numberOfCorrectAnswersSubject = new BehaviorSubject<number | undefined>(undefined);

  private explanationTextReady$ = new BehaviorSubject<boolean>(false);
  private currentQuestionReady$ = new BehaviorSubject<boolean>(false);

  private destroy$ = new Subject<void>();

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService,
    private activatedRoute: ActivatedRoute
  ) {}

  ngOnInit(): void {
    console.log('Current Question Observable:', this.currentQuestion$);
    // this.currentQuestion = new BehaviorSubject<QuizQuestion>(null);
  
    // this.currentOptions$ = this.quizStateService.currentOptions$;

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

    this.currentOptions$ = this.quizService.getOptionsObservable();
    this.currentOptions$.subscribe((options) => {
      this.options = options;
    });


    this.quizStateService.getCurrentQuestion().subscribe((question) => {
      console.log('CodelabQuizComponent - Current Question received:', question);
      this.currentQuestion$ = of(question);
      console.log('CodelabQuizComponent - currentQuestion$:', this.currentQuestion$);
    });
    
    this.quizStateService.currentOptions$.subscribe((options) => {
      this.currentOptions$.next(options);
    });

    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        this.options = question.options;
      }
    });

    this.currentQuestionIndex$ = this.quizService.getCurrentQuestionIndexObservable();
    this.currentQuestionIndex$.subscribe((index) => {
      this.currentQuestionIndexValue = index;
      console.log("CQIV", this.currentQuestionIndexValue);
    });



    this.currentQuestion$.subscribe((question) => {
      console.log('Question received:', question);
      if (question && question.options) {
        console.log('Options received::::::::', question.options);
      }
    });

    this.currentOptions$.subscribe((options) => {
      console.log('THE Current Options:', options);
    });
  
    this.currentOptions$.subscribe((options) => {
      this.options = options;
    });

    this.quizStateService.currentOptions$.subscribe((options) => {
      console.log('Options received:', options);
      this.options = options;
    });
    

    this.quizStateService.currentQuestion$.subscribe((question) => {
      console.log('MY Current question:', question);
      this.question = question;

      if (question && question.options) {
        console.log('MY Options:', question.options);
      }
    });
  
    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.currentQuestionSubscription = this.currentQuestion$.subscribe((question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
        const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(question);
        this.numberOfCorrectAnswers$.next(numberOfCorrectAnswers);
      }
    });

    this.nextQuestion$ = this.quizService.nextQuestion$.pipe(
      tap((nextQuestion) => console.log('Next question emitted:::', nextQuestion))
    );
  
    this.nextQuestionSubscription = this.quizService.nextQuestion$.pipe(
      // Use the tap operator to log the received question for debugging
      tap((nextQuestion) => console.log('Next question received:', nextQuestion))
    ).subscribe((nextQuestion) => {
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
  
    this.explanationText$ = this.explanationTextService.getExplanationText$();
    this.explanationTextSubscription = this.explanationText$.subscribe((explanationText) => {
      const displayed = !!explanationText;
      this.quizQuestionManagerService.setExplanationDisplayed(displayed);
    });

    /* this.combinedQuestionData$ = this.explanationText$.pipe(
      withLatestFrom(this.currentQuestion$, this.numberOfCorrectAnswers$),
      map(([explanationText, currentQuestion, numberOfCorrectAnswers]) => {
        const questionText = explanationText || this.getQuestionText(currentQuestion, this.questions);

        const correctAnswersText = numberOfCorrectAnswers !== undefined
          ? this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers)
          : '';

        return { questionText, correctAnswersText };
      })
    ); */

    this.combinedQuestionData$ = this.explanationText$.pipe(
      withLatestFrom(this.currentQuestion$, this.numberOfCorrectAnswers$),
      map(([explanationText, currentQuestion, numberOfCorrectAnswers]) => {
        const questionText = explanationText || this.getQuestionText(currentQuestion, this.questions);
    
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
    
        let correctAnswersText = '';
        if (questionHasMultipleAnswers && numberOfCorrectAnswers !== undefined) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
    
        return { questionText, correctAnswersText };
      })
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription.unsubscribe();
    this.explanationTextSubscription.unsubscribe();
    this.nextQuestionSubscription.unsubscribe();
  }

  getQuestionText(currentQuestion: QuizQuestion, questions: QuizQuestion[]): string {
    if (currentQuestion && questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        if (this.areQuestionsEqual(questions[i], currentQuestion)) {
          return questions[i]?.questionText;
        }
      }
    }
    return '';
  }

  getNumberOfCorrectAnswersText(numberOfCorrectAnswers: number | undefined): string {
    if (numberOfCorrectAnswers === undefined) {
      return '';
    }

    const correctAnswersText = numberOfCorrectAnswers === 1
      ? `(${numberOfCorrectAnswers} answer is correct)`
      : `(${numberOfCorrectAnswers} answers are correct)`;

    return correctAnswersText;
  }

  calculateNumberOfCorrectAnswers(question: QuizQuestion): number {
    if (question) {
      return question.options.reduce((count, option) => count + (option.correct ? 1 : 0), 0);
    }
    return 0;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }

  areQuestionsEqual(question1: QuizQuestion, question2: QuizQuestion): boolean {
    return question1.questionText === question2.questionText &&
           JSON.stringify(question1.options) === JSON.stringify(question2.options);
  }

  waitForValues<T, U>(source1: Observable<T>, source2: Observable<U>): Observable<[T, U]> {
    return source1.pipe(
      filter(Boolean),
      switchMap((value1) => {
        return source2.pipe(
          filter(Boolean),
          map((value2) => [value1, value2] as [T, U])
        );
      })
    );
  }
}
