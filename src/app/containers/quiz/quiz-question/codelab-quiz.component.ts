import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BehaviorSubject, Observable } from '@angular/rxjs';

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
  currentQuestion: BehaviorSubject<QuizQuestion | null>;
  explanationText$: Observable<string>;
  numberOfCorrectAnswers: number;

  constructor(
    private quizService: QuizService,
    private quizStateService: QuizStateService,
    private explanationTextService: ExplanationTextService,
    private quizQuestionManagerService: QuizQuestionManagerService
  ) {}

  ngOnInit(): void {
    this.currentQuestion = this.quizStateService.getCurrentQuestion();
    this.explanationText$ = this.explanationTextService.getExplanationText$();
    this.numberOfCorrectAnswers = this.quizService.numberOfCorrectAnswers;
  }

  shouldDisplayExplanationText(): boolean {
    return this.quizQuestionManagerService.shouldDisplayExplanationText();
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }
}