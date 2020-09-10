import { Component, EventEmitter, Input, OnChanges, OnInit, Output } from '@angular/core';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { TimerService } from '../../../shared/services/timer.service';

@Component({
  selector: 'codelab-question-single-answer',
  templateUrl: './single-answer.component.html',
  styleUrls: ['./single-answer.component.scss']
})
export class SingleAnswerComponent implements OnInit, OnChanges {
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  multipleAnswer: boolean;
  alreadyAnswered: boolean;
  currentQuestion: QuizQuestion;

  quizStarted: boolean;
  correctAnswers = [];
  correctMessage = '';
  isAnswered: boolean;
  isCorrectAnswerSelected: boolean;

  constructor(private quizService: QuizService, private timerService: TimerService) {}

  ngOnInit(): void {
    this.question = this.currentQuestion;
    this.multipleAnswer = this.quizService.multipleAnswer;
    this.alreadyAnswered = this.quizService.alreadyAnswered;
    this.isAnswered = this.quizService.isAnswered;
    this.currentQuestion = this.quizService.currentQuestion;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.question && changes.question.currentValue !== changes.question.firstChange) {
      this.currentQuestion = changes.question.currentValue;
      this.correctAnswers = this.quizService.getCorrectAnswers(this.currentQuestion);
      this.multipleAnswer = this.correctAnswers.length > 1;

      if (this.formGroup) {
        this.formGroup.patchValue({answer: ''});
        this.alreadyAnswered = false;
      }
    }
  }

  setSelected(optionIndex: number): void {
    this.quizStarted = true;
    this.correctMessage = this.quizService.correctMessage;
    this.isCorrectAnswerSelected = this.isCorrect(this.currentQuestion.options[optionIndex].correct, optionIndex);
    this.answer.emit(optionIndex);

    if (this.correctAnswers.length === 1) {
      this.currentQuestion.options.forEach((option) => option.selected = false);
    }
    this.currentQuestion.options[optionIndex].selected = true;

    if (
      optionIndex >= 0 &&
      this.currentQuestion &&
      this.currentQuestion.options &&
      this.currentQuestion.options[optionIndex]['correct']
    ) {
      this.timerService.stopTimer();
      this.quizService.correctSound.play();
      optionIndex = null;
    } else {
      this.quizService.incorrectSound.play();
    }
    this.alreadyAnswered = true;
  }

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  private sendMultipleAnswerToQuizService(): void {
    this.quizService.setMultipleAnswer(this.multipleAnswer);
  }

  private sendAlreadyAnsweredToQuizService(): void {
    this.quizService.setAlreadyAnswered(this.alreadyAnswered);
  }

  private sendCurrentQuestionToQuizService(): void {
    this.quizService.setCurrentQuestion(this.currentQuestion);
  }
}
