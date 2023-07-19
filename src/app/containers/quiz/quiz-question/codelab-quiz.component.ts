import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';

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
  currentQuestion$: Observable<QuizQuestion> = of({} as QuizQuestion);
  explanationText$: Observable<string>;
  options: Option[] = [];
  options$: Observable<string[]>;
  numberOfCorrectAnswers: number = 0;
  shouldDisplayNumberOfCorrectAnswers: boolean;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;
  currentQuestionSubscription: Subscription;
  optionsSubscription: Subscription | undefined;

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService
  ) {}

  ngOnInit(): void {
    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.explanationText$ = this.explanationTextService.getExplanationText$();
    this.options$ = of([]);
    this.currentQuestion = new BehaviorSubject<QuizQuestion>(null);
    this.quizService.navigateToNextQuestion();

    this.quizStateService.currentQuestion$.subscribe((currentQuestion) => {
      if (currentQuestion) {
        this.currentQuestion = currentQuestion;
      }
    });

    this.currentQuestion$.subscribe((question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
      }
    });

    this.currentQuestionSubscription = this.quizService.currentQuestion$.subscribe((currentQuestion) => {
      if (currentQuestion) {
        this.currentQuestion = currentQuestion;
        this.options$ = of(currentQuestion.options.map((option) => option.value.toString()));
      } else {
        // Handle the scenario when there are no more questions
        // For example, you can navigate to a different page here
        // this.router.navigate(['/quiz-completed']);
      }
    });

    this.explanationTextSubscription = this.explanationText$.subscribe((explanationText) => {
      const displayed = !!explanationText;
      this.quizQuestionManagerService.setExplanationDisplayed(displayed);
    });

    this.nextQuestionSubscription = this.quizService.nextQuestion$.subscribe((nextQuestion) => {
      if (nextQuestion) {
        this.currentQuestion = nextQuestion;
        console.log('Received next question:', nextQuestion);
        this.quizService.setCurrentQuestion(nextQuestion);

        this.options$ = of(nextQuestion.options.map((option) => option.value.toString()));
      } else {
        // Handle the scenario when there are no more questions
        // For example, you can navigate to a different page here
        // this.router.navigate(['/quiz-completed']);
      }
    });

    this.optionsSubscription = this.quizService.options$.subscribe((options) => {
      if (options) {
        this.options = options;
        console.log('Received options:', options);
      }
    });
  }

  ngOnDestroy(): void {
    this.explanationTextSubscription.unsubscribe();
    this.currentQuestionSubscription.unsubscribe();
    this.nextQuestionSubscription.unsubscribe();
    this.optionsSubscription.unsubscribe(); 
  }

  getNumberOfCorrectAnswersText(): string {
    const count = this.quizQuestionManagerService.getNumberOfCorrectAnswers();
    return count === 1 ? `(${count} answer is correct)` : `(${count} answers are correct)`;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }
}