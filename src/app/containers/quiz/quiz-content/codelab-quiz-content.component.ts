import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, combineLatest, from, Observable, of, Subject, Subscription } from 'rxjs';
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

  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;

  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
  explanationText: string | null = null;

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
    private selectedOptionService: SelectedOptionService,
    private activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef
  ) {
    this.explanationText$ = this.explanationTextService.explanationText$;
  }

  ngOnInit(): void {
    this.initializeQuestionData();
    this.initializeNextQuestionSubscription();
    this.initializeExplanationTextSubscription();
    this.initializeCombinedQuestionData();
  
    // this.currentQuestion$ = this.quizQuestionManagerService.getCurrentQuestion$();
    this.explanationText$ = this.explanationTextService.explanationText$;

    this.explanationTextService.explanationText$.subscribe((explanationText) => {
      console.log('Explanation Text:::>>>>>', explanationText);
      this.explanationText = explanationText;
      this.cdRef.detectChanges();
    });
  
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
      console.log('Current Question Subscribed:', question);

      if (question) {
        console.log('Current Question Value:', question.questionText);
  
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

    console.log('Current Question:', this.currentQuestion);
    console.log('Value:', this.currentQuestion?.value);
    console.log('Value Question Text:', this.currentQuestion?.value?.questionText);

  
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
      
    /* this.quizStateService.getCurrentQuestion().subscribe((question) => {
      this.currentQuestion$ = of(question);
    }); */
  
    this.quizStateService.currentOptions$.subscribe((options) => {
      this.currentOptions$.next(options);
    });
  
    this.currentQuestion$.subscribe((question) => {
      if (question && question.options) {
        this.options = question.options;
        console.log('Options received', question.options);
      }
    });

    this.currentOptions$.subscribe((options) => {
      this.options = options;
      console.log('Current Options:', options);
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
    this.explanationText$ = this.explanationTextService.getExplanationText$();
    this.explanationTextSubscription = this.explanationText$.subscribe(
      (explanationText) => {
        const displayed = !!explanationText;
  
        // Add code to get the selected option's explanation
        const selectedOptionExplanation = this.selectedOptionService.getSelectedOptionExplanation();
  
        // Combine the selected option's explanation with the overall explanation text
        const combinedExplanationText = selectedOptionExplanation
          ? `${explanationText}\n\n${selectedOptionExplanation}`
          : explanationText;
  
        this.quizQuestionManagerService.setExplanationText(combinedExplanationText);
        this.quizQuestionManagerService.setExplanationDisplayed(displayed);
      }
    );
  }

  /* private initializeExplanationTextSubscription(): void {
    const selectedOptionExplanation$ = this.selectedOptionService.selectedOptionExplanation$;
    
    this.explanationText$ = combineLatest([
      this.explanationTextService.getExplanationText$(),
      selectedOptionExplanation$
    ]).pipe(
      map(([explanationText, selectedOptionExplanation]) => selectedOptionExplanation || explanationText)
    );
  
    this.explanationTextSubscription = this.explanationText$.subscribe((displayText) => {
      // Update the necessary values in your service
      this.quizQuestionManagerService.setExplanationText(displayText);
      this.quizQuestionManagerService.setExplanationDisplayed(!!displayText);
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
  
        const displayText = explanationText || `${questionText} ${correctAnswersText}`;
  
        return { questionText: questionText, explanationText, correctAnswersText, currentOptions };
      })
    );
  
    this.combinedQuestionData$.subscribe((data) => {
      const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(data.currentOptions);
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
          console.log('Found matching question:', questions[i]);
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