import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { Option } from '../../shared/models/Option.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

@Component({
  selector: 'codelab-quiz-question',
  templateUrl: './question.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuizQuestionComponent implements OnInit, OnChanges {
  @Output() answer = new EventEmitter<number>();
  @Output() formValue = new EventEmitter<FormGroup>();
  @Input() question: QuizQuestion;
  @Input() currentQuestionIndex: number;
  currentQuestion: QuizQuestion;
  questionForm: FormGroup;
  optionSelected: Option;
  correctAnswers: number[] = [];
  correctMessage: string = '';
  multipleAnswer: boolean;
  alreadyAnswered = false;
  selectedOption: Option;
  hasSelectedOptions = false;
  answers;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {
    this.correctMessage = '';
  }

  ngOnInit(): void {
    this.questionForm = new FormGroup({
      answer: new FormControl('', Validators.required),
    });
    this.currentQuestion = this.quizService.getCurrentQuestion();

    // this.question = this.quizData[this.currentQuestionIndex];
    this.currentQuestion = this.quizService.getCurrentQuestion();
    console.log('current question index: ', this.currentQuestion);
    this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
    console.log('correct answers: ', this.correctAnswers);
    this.answers = this.quizService.getAnswers();

    this.sendMultipleAnswerToQuizService(this.multipleAnswer);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.question || !this.question.options) {
      return;
    }

    if (changes.question) {
      this.currentQuestion = changes.question.currentValue;
      this.updateCorrectMessage();
    }

    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      console.log('CA1::', this.correctAnswers);
      this.correctMessage = this.quizService.setCorrectMessage(
        this.question,
        this.correctAnswers
      );
    }

    this.updateCurrentQuestion(this.question);
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  private updateCurrentQuestion(question: QuizQuestion) {
    this.currentQuestion = question;
    console.log('CURRQUEST: ', this.currentQuestion);
  }

  private updateCorrectAnswers(): void {
    if (this.question && this.question.options) {
      this.correctAnswers = this.question.options
        .filter((option) => option.correct)
        .map((option) => option.value);
      console.log('CA:::', this.correctAnswers);
    }
  }

  private async updateCorrectMessage(): Promise<void> {
    if (this.question && this.currentQuestion) {
      try {
        console.log(
          'QSSCM::',
          await this.quizService.setCorrectMessage(
            this.question,
            this.correctAnswers
          )
        );
        this.correctMessage = await this.quizService.setCorrectMessage(
          this.question,
          this.correctAnswers
        );
      } catch (error) {
        console.error(
          'An error occurred while updating the correct message:',
          error
        );
      }
    } else {
      this.correctMessage = 'The correct answers are not available yet.';
    }
  }

  private updateMultipleAnswer(): void {
    this.multipleAnswer = this.correctAnswers.length > 1;
  }

  private resetForm(): void {
    if (!this.questionForm) {
      return;
    }

    this.questionForm.patchValue({ answer: '' });
    this.alreadyAnswered = false;
  }

  private updateSelectedOption(
    selectedOption: Option,
    optionIndex: number
  ): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);
    this.selectedOption = selectedOption;

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(this.selectedOption, optionIndex);
    this.playSound(optionIndex);
  }

  private clearSelection(): void {
    if (this.correctAnswers.length === 1) {
      this.currentQuestion.options.forEach((option) => {
        option.selected = false;
        option.styleClass = '';
      });
    }
  }

  private updateSelection(optionIndex: number): void {
    const option = this.currentQuestion.options[optionIndex];
    if (option && this.currentQuestion.options) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  onOptionSelected(option) {
    this.selectedOption = option;
  }

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (selectedOption) {
      this.optionSelected.styleClass = this.currentQuestion.options[
        optionIndex
      ]['correct']
        ? 'correct'
        : 'incorrect';
    }
  }

  private playSound(optionIndex: number): void {
    if (this.currentQuestion.options[optionIndex]['correct']) {
      this.timerService.stopTimer();
      this.quizService.correctSound.play();
    } else {
      this.quizService.incorrectSound.play();
    }
  }

  sendMultipleAnswerToQuizService(multipleAnswer: boolean): void {
    this.quizService.setMultipleAnswer(multipleAnswer);
  }
}
