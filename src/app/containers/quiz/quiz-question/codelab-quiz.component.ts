import { ChangeDetectionStrategy, Component } from '@angular/core';

import { QuizQuestionManagerService } from '../../../shared/services/quizquestionmgr.service';

@Component({
  selector: 'codelab-quiz-cp-component',
  templateUrl: './codelab-quiz.component.html',
  styleUrls: ['./codelab-quiz.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodelabQuizComponent { 
  currentQuestion: any; // Replace `any` with the appropriate type for your quiz question
  explanationText: string;
  numberOfCorrectAnswers: number;

  constructor(private quizQuestionManagerService: QuizQuestionManagerService) {}

  ngOnInit(): void {
    this.currentQuestion = this.quizQuestionManagerService.getCurrentQuestion();
    this.explanationText = this.quizQuestionManagerService.getExplanationText();
    this.numberOfCorrectAnswers = this.quizQuestionManagerService.getNumberOfCorrectAnswers();
  }

  shouldDisplayExplanationText(): boolean {
    return this.quizQuestionManagerService.shouldDisplayExplanationText();
  }

  shouldDisplayNumberOfCorrectAnswersCount(): boolean {
    return this.quizQuestionManagerService.shouldDisplayNumberOfCorrectAnswersCount();
  }
}