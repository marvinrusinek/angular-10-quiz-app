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
  currentQuestion: QuizQuestion;
  questionForm: FormGroup;
  optionSelected: Option;
  // correctAnswers: Option[] = [];
  correctAnswers: number[] = [];
  correctMessage: string = '';
  multipleAnswer: boolean;
  alreadyAnswered = false;
  selectedOption: Option;
  hasSelectedOptions = false;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {
    console.log('question:::', this.question);
    console.log('QS', quizService);
    // this.currentQuestion = {};
    this.correctMessage = '';
    console.log('CORR MSG: ' + this.correctMessage);
    console.log('question: ' + this.question);
    console.log('currentQuestion: ' + this.currentQuestion);
  }

  ngOnInit(): void {
    console.log('Question: ', this.question);
    console.log('Correct answers: ', this.correctAnswers);
    console.log('CA ng: ', this.correctAnswers);
    this.questionForm = new FormGroup({
      answer: new FormControl('', Validators.required),
    });
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
    }
  }

  private updateCorrectMessage(): void {
    if (this.question && this.currentQuestion) {
      this.correctMessage = this.quizService.setCorrectMessage(
        this.question,
        this.correctAnswers
      );
    } else {
      return 'The correct answers are not available yet.';
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
    if (option) {
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
