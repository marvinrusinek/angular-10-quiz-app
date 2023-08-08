import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, from, Observable, of, Subject, Subscription } from 'rxjs';
import { filter, map, switchMap, takeUntil, tap, withLatestFrom } from 'rxjs/operators';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizDataService } from '../../../shared/services/quizdata.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';

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

  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();

  @Input() combinedQuestionData$: Observable<{
    questionText: string;
    explanationText?: string;
    correctAnswersText?: string;
    currentOptions: Option[];
  }> | null = null;

  currentDisplayText: string = '';
  showExplanation: boolean = false;

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
    this.initializeQuestionData();
    this.initializeNextQuestionSubscription();
    this.initializeExplanationTextSubscription();

    this.quizQuestionManagerService.getCurrentQuestion$().subscribe((question) => {
      console.log('Current Question:>', question);
    });

    this.initializeCombinedQuestionData();

    this.currentQuestion$ = this.quizQuestionManagerService.getCurrentQuestion$();

    // this.currentOptions$ = this.quizService.currentOptionsSubject;
    // this.currentQuestion$ = from(this.quizService.getCurrentQuestion());

    this.explanationText$ = this.explanationTextService.explanationText$;

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
      this.currentQuestion = question;
    });

    this.quizQuestionManagerService.explanationText$.subscribe((explanationText) => {
      // Update currentDisplayText to display either question text or explanation text
      this.currentDisplayText = explanationText || this.currentQuestion?.value?.questionText || '';
    });
      
    console.log('CodelabQuizCpComponent - Question:', this.question);
    console.log('CodelabQuizCpComponent - Options:', this.options);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription?.unsubscribe();
    this.explanationTextSubscription?.unsubscribe();
    this.nextQuestionSubscription?.unsubscribe();
  }

  onOptionSelected(option: Option): void {
    const currentQuestion = this.quizQuestionManagerService.getCurrentQuestion();
    if (currentQuestion) {
      const selectedOption = currentQuestion.options.find((opt) => opt.id === option.optionId);
      if (selectedOption) {
        this.quizQuestionManagerService.setExplanationText(selectedOption.explanation || null);
        this.currentDisplayText = selectedOption.explanation || currentQuestion.questionText;
      }
    }
  }

  onOptionClicked(option: Option): void {
    // Your existing code in the onOptionClicked method

    this.showExplanation = true; // Set showExplanation to true to display the explanation text

    // Your other existing code
  }

  updateExplanationTextForSelectedOption(): void {
    this.quizQuestionManagerService.updateExplanationTextForSelectedOption();
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
  
    /* this.currentOptions$ = this.quizService.getOptionsObservable().pipe(
      withLatestFrom(this.currentQuestion$),
      map(([options, currentQuestion]) => {
        // Filter and return the options for the current question
        if (currentQuestion && options) {
          return options.filter((option) => {
            // Assuming each option has a unique id and each question has a unique id
            return currentQuestion.options.some((qOption) => qOption.optionId === option.optionId);
          });
        }
        return [];
      })
    ); */
      
    this.quizStateService.getCurrentQuestion().subscribe((question) => {
      this.currentQuestion$ = of(question);
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
    });
  
    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        console.log('Options received', question.options);
      }
    });
  
    this.currentOptions$.subscribe((options) => {
      console.log('Current Options:', options);
    });
  
    this.currentOptions$.subscribe((options) => {
      this.options = options;
    });
  
    this.quizStateService.currentOptions$.subscribe((options) => {
      this.options = options;
    });
  
    this.quizStateService.currentQuestion$.subscribe((question) => {
      this.question = question;
  
      if (question && question.options) {
        console.log('Options:', question.options);
      }
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
    this.explanationText$ = this.explanationTextService.getExplanationText$();
    this.explanationTextSubscription = this.explanationText$.subscribe(
      (explanationText) => {
        const displayed = !!explanationText;
        this.quizQuestionManagerService.setExplanationText(explanationText);
        this.quizQuestionManagerService.setExplanationDisplayed(displayed);
      }
    );
  }

  /* private initializeCombinedQuestionData(): void {
    const currentQuestionAndOptions$ = this.currentQuestion$.pipe(
      withLatestFrom(this.currentOptions$),
      map(([currentQuestion, currentOptions]) => ({ currentQuestion, currentOptions }))
    );
  
    this.combinedQuestionData$ = this.explanationText$.pipe(
      withLatestFrom(currentQuestionAndOptions$, this.numberOfCorrectAnswers$),
      tap(data => console.log('Combined Question Data:', data)),
      map(([explanationText, { currentQuestion, currentOptions }, numberOfCorrectAnswers]) => {
        const questionText = explanationText || this.getQuestionText(currentQuestion, this.questions);
  
        const questionHasMultipleAnswers = this.quizStateService.isMultipleAnswer();
  
        let correctAnswersText = '';
        if (questionHasMultipleAnswers && !explanationText && numberOfCorrectAnswers !== undefined && +numberOfCorrectAnswers > 1) {
          correctAnswersText = this.getNumberOfCorrectAnswersText(+numberOfCorrectAnswers);
        }
  
        return { questionText, correctAnswersText, currentOptions };
      })
    );

    this.combinedQuestionData$.subscribe((data) => {
      console.log('Combined Question Data:::>>>>>', data);
    });
  } */

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
  
        const displayText = explanationText || questionText; // Choose explanation or question
  
        return { questionText: questionText, explanationText, correctAnswersText, currentOptions };
      })
    );
  
    this.combinedQuestionData$.subscribe((data) => {
      this.currentDisplayText = data; // Set the current display text to the data object
      console.log('Combined Question Data:::>>>>>', data);
    });
  }
  
     
  getQuestionText(
    currentQuestion: QuizQuestion,
    questions: QuizQuestion[]
  ): string {
    if (currentQuestion && questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
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
      return question.options.reduce(
        (count, option) => count + (option.correct ? 1 : 0),
        0
      );
    }
    return 0;
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