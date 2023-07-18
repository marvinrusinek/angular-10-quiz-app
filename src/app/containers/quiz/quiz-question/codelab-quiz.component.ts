import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
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
  quizServiceSubscription: Subscription;

  constructor(
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService
  ) {}

  ngOnInit(): void {
    this.currentQuestion$ = this.quizStateService.getCurrentQuestion();
    this.explanationText$ = this.explanationTextService.getExplanationText$();

    this.currentQuestion$.subscribe((question) => {
      if (question) {
        this.quizQuestionManagerService.setCurrentQuestion(question);
        this.numberOfCorrectAnswers = this.quizQuestionManagerService.getNumberOfCorrectAnswers();
        this.shouldDisplayNumberOfCorrectAnswers = this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
      }
    });
  }

  ngOnDestroy(): void {
    this.quizServiceSubscription.unsubscribe();
  }

  getNumberOfCorrectAnswersText(): string {
    const count = this.quizQuestionManagerService.getNumberOfCorrectAnswers();
    return count === 1 ? `(${count} answer is correct)` : `(${count} answers are correct)`;
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }
}