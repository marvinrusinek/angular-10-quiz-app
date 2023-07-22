import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
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
  currentQuestion: BehaviorSubject<QuizQuestion> = new BehaviorSubject<QuizQuestion>(null);
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
  currentOptions$: Observable<Option[]> = this.quizService.options$;
  explanationText$: Observable<string>;
  options: Option[] = [];
  options$: Observable<string[]>;
  numberOfCorrectAnswers: number = 0;
  numberOfCorrectAnswers$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  shouldDisplayNumberOfCorrectAnswers: boolean;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService
  ) {}

  ngOnInit(): void {
    this.currentQuestion = new BehaviorSubject<QuizQuestion>(null);
    this.options$ = this.quizService.options$.pipe(
      map((options: Option[]) => options?.map((option) => option?.value?.toString()))
    );

    this.quizService.options$.subscribe((options) => {
      console.log('Options received:', options);
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
        this.currentQuestion.next(nextQuestion);
        this.currentOptions$.next(nextQuestion.options.map((option) => option.value.toString()));
        // this.options$ = of(nextQuestion.options.map((option) => option.value.toString()));
        console.log("CQ:>>>", this.currentQuestion);
        console.log("OPTIONS:>>>", this.options$);
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