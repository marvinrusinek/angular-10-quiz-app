import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { map, take } from 'rxjs/operators';

import { Option } from '../../../shared/models/Option.model';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { QuizStateService } from '../../../shared/services/quizstate.service';
import { ExplanationTextService } from '../../../shared/services/explanation-text.service';
import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';
 
@Component({
  selector: 'codelab-quiz-cp-component',
  templateUrl: './codelab-quiz.component.html',
  styleUrls: ['./codelab-quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizComponent { 
  currentQuestion: BehaviorSubject<QuizQuestion>;
  // currentQuestion$: BehaviorSubject<QuizQuestion | null> = new BehaviorSubject<QuizQuestion | null>(null);
  // currentQuestion$: Observable<QuizQuestion> = of({} as QuizQuestion);
  currentQuestion$: Observable<QuizQuestion | null> = of(null);
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
      map((options: Option[]) => options.map((option) => option.value.toString()))
    );
  
    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.currentQuestionSubscription = this.currentQuestion$.subscribe((question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
        const numberOfCorrectAnswers = this.calculateNumberOfCorrectAnswers(question);
        this.numberOfCorrectAnswers$.next(numberOfCorrectAnswers);
        // this.numberOfCorrectAnswers$.next(this.quizQuestionManagerService.getNumberOfCorrectAnswers());
        // this.numberOfCorrectAnswers$.next(this.calculateNumberOfCorrectAnswers(question));
        //this.numberOfCorrectAnswers$.next(this.quizQuestionManagerService.getNumberOfCorrectAnswers());
      }
    });
  
    this.nextQuestionSubscription = this.quizService.nextQuestion$.subscribe((nextQuestion) => {
      if (nextQuestion) {
        this.currentQuestion = nextQuestion;
        this.options$ = of(nextQuestion.options.map((option) => option.value.toString()));
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

  getNumberOfCorrectAnswersText(count: number): string {
    return count === 1 ? `(${count} answer is correct)` : `(${count} answers are correct)`;
  }
  
  /* getNumberOfCorrectAnswersText(): Observable<string> {
    return this.quizQuestionManagerService.getNumberOfCorrectAnswers$().pipe(
      map(count => count === 1 ? `(${count} answer is correct)` : `(${count} answers are correct)`)
    );
  } */

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