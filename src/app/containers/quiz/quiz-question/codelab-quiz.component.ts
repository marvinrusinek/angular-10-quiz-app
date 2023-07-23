import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable, of, Subject, Subscription } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';

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
  // @Input() currentQuestion: BehaviorSubject<QuizQuestion> = new BehaviorSubject<QuizQuestion>(null);
  // @Input() options: Option[] = [];
  question: QuizQuestion;
  questions: QuizQuestion[];
  questions$: Observable<QuizQuestion[]>;
  quizId: string;
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  // currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  // currentOptions$: Observable<Option[]> = this.quizService.options$;
  currentOptions$: BehaviorSubject<Option[]> = new BehaviorSubject<Option[]>([]);
  currentQuestionIndex$: Observable<number>;
  // explanationText$: Observable<string>;
  // options$: Observable<string[]>;
  options$: Observable<Option[] | null>; 
  numberOfCorrectAnswers: number = 0;
  numberOfCorrectAnswers$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  shouldDisplayNumberOfCorrectAnswers: boolean;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;
  private explanationTextSource = new BehaviorSubject<string>(null);
  explanationText$ = this.explanationTextSource.asObservable();
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

    this.activatedRoute.paramMap.pipe(
      switchMap((params) => {
        this.quizId = params.get('quizId');
        if (this.quizId) {
          // Use switchMap to transform questions$ to currentQuestion$
          return this.quizDataService.getQuestionsForQuiz(this.quizId);
        } else {
          return of(null);
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe((questions) => {
      this.questions = questions;
      // Update currentQuestion$ based on the new questions
      this.currentQuestion$ = this.quizService.getCurrentQuestionObservable();
      console.log('Current question after update:', this.currentQuestion$);
    });

    this.currentQuestion$ = this.quizService.getCurrentQuestionObservable();
    this.options$ = this.quizService.getOptionsObservable();
    this.quizService.getOptionsObservable().subscribe((options) => {
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
      console.log('Question received:', question);
      if (question && question.options) {
        console.log('Options received::::::::', question.options);
        this.options = question.options;
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
  
    this.nextQuestionSubscription = this.quizService.nextQuestion$.subscribe((nextQuestion) => {
      console.log('Next question received:', nextQuestion);
      if (nextQuestion) {
        this.currentQuestion$.next(nextQuestion);
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
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentQuestionSubscription.unsubscribe();
    this.explanationTextSubscription.unsubscribe();
    this.nextQuestionSubscription.unsubscribe();
  }

  getNumberOfCorrectAnswersText(numberOfCorrectAnswers: number): string {
    return numberOfCorrectAnswers === 1
      ? `(${numberOfCorrectAnswers} answer is correct)`
      : `(${numberOfCorrectAnswers} answers are correct)`;
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
}