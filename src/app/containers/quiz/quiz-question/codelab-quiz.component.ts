import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable, of, Subscription } from 'rxjs';

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
  currentQuestion$: Observable<QuizQuestion>;
  explanationText$: Observable<string>;
  numberOfCorrectAnswers: number = 0;
  shouldDisplayNumberOfCorrectAnswers: boolean;
  explanationTextSubscription: Subscription;
  nextQuestionSubscription: Subscription;

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService
  ) {}

  ngOnInit(): void {
    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.explanationText$ = this.explanationTextService.getExplanationText$();

    // Subscribe to the nextQuestion$ observable
    /* this.nextQuestionSubscription = this.quizService.nextQuestion$.subscribe((nextQuestion) => {
      if (nextQuestion) {
        // Update the current question in the quiz state service
        this.quizStateService.setCurrentQuestion(nextQuestion);
      } else {
        // Handle the scenario when there are no more questions
        // For example, you can navigate to a different page here
        // this.router.navigate(['/quiz-completed']);
      }
    }); */

    this.nextQuestionSubscription = this.quizService.nextQuestion$.subscribe((nextQuestion) => {
      if (nextQuestion) {
        // this.currentQuestion$ = of(nextQuestion);
        this.currentQuestion = nextQuestion;
        this.quizStateService.setCurrentQuestion(nextQuestion);
      } else {
        // Handle the scenario when there are no more questions
        // For example, you can navigate to a different page here
        // this.router.navigate(['/quiz-completed']);
      }
    });

    this.currentQuestion$.subscribe((question: QuizQuestion) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
      }
    });

    this.explanationTextSubscription = this.explanationText$.subscribe((explanationText) => {
      const displayed = !!explanationText;
      this.quizQuestionManagerService.setExplanationDisplayed(displayed);
    });
  }

  ngOnDestroy(): void {
    this.explanationTextSubscription.unsubscribe();
    this.nextQuestionSubscription.unsubscribe();
  }

  getNumberOfCorrectAnswersText(): string {
    const count = this.quizQuestionManagerService.getNumberOfCorrectAnswers();
    return count === 1 ? `(${count} answer is correct)` : `(${count} answers are correct)`;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }
}