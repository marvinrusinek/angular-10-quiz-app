import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';


@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  styleUrls: ['./question.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  currentQuestion: QuizQuestion;
  @Output() answer = new EventEmitter<number>();
  @Input() question: QuizQuestion;
  formGroup: FormGroup;
  quizStarted: boolean;
  multipleAnswer: boolean;
  alreadyAnswered = false;
  correctAnswers = [];
  correctMessage = '';
  isCorrectAnswerSelected = false;
  previousUserAnswersTextSingleAnswer = [];
  previousUserAnswersTextMultipleAnswer = [];

  constructor(
    private quizService: QuizService, 
    private timerService: TimerService
  ) { }

  ngOnInit() {
    this.formGroup = new FormGroup({
      answer: new FormControl(['', Validators.required])
    });

    this.previousUserAnswersTextSingleAnswer = this.quizService.previousUserAnswersTextSingleAnswer;
    this.previousUserAnswersTextMultipleAnswer = this.quizService.previousUserAnswersTextMultipleAnswer;

    this.question = this.currentQuestion;
    this.previousUserAnswers = this.quizService.userAnswers;
    this.isAnswered = this.quizService.isAnswered;
    this.sendCurrentQuestionToQuizService();
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

  isCorrect(correct: boolean, optionIndex: number): boolean {
    return correct === this.currentQuestion.options[optionIndex].correct;
  }

  setSelected(optionIndex: number): void {
    this.quizStarted = true;
    this.correctMessage = this.quizService.correctMessage;
    this.isCorrectAnswerSelected = this.isCorrect(this.currentQuestion.options[optionIndex].correct, optionIndex);
    this.answer.emit(optionIndex);

    if (this.correctAnswers.length === 1) {
      this.currentQuestion.options.forEach((option: Option) => option.selected = false);
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
