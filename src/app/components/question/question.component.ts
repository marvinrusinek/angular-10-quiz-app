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
  @Input() question: QuizQuestion;
  currentQuestion: QuizQuestion;
  questionForm: FormGroup;
  optionSelected: Option;
  correctAnswers: Option[] = [];
  correctMessage = '';
  multipleAnswer: boolean;
  alreadyAnswered = false;
  selectedOption: Option;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) {}

  ngOnInit(): void {
    this.questionForm = new FormGroup({
      answer: new FormControl(['', Validators.required]),
    });
    this.sendMultipleAnswerToQuizService(this.multipleAnswer);
  }

  ngOnChanges({ question }: SimpleChanges): void {
    if (!question) {
      return;
    }

    this.updateCurrentQuestion(question.currentValue);
    this.updateCorrectAnswers();
    this.updateCorrectMessage();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  private updateCurrentQuestion(question: QuizQuestion): void {
    this.currentQuestion = question;
  }

  private updateCorrectAnswers(): void {
    this.correctAnswers = this.quizService.getCorrectAnswers(
      this.currentQuestion
    );
  }

  private updateCorrectMessage(): void {
    this.correctMessage = this.quizService.correctMessage;
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

  updateSelectedOption(option: any, optionIndex: number): void {
    this.alreadyAnswered = true;
    this.answer.emit(optionIndex);

    this.clearSelection();
    this.updateSelection(optionIndex);
    this.updateClassName(optionIndex);
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
    console.log(this.currentQuestion.options);
    const option = this.currentQuestion.options[optionIndex];
    if (option) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  /* private updateSelection(optionIndex: number): void {
    console.log(this.currentQuestion.options);
    const option = this.currentQuestion.options[optionIndex];
    if (option) {
      option.selected = true;
      this.optionSelected = option;
    }
  } */

  /* private updateSelection(optionIndex: number): void {
    if (!this.currentQuestion) {
      console.error('this.currentQuestion is undefined');
      return;
    }
    this.currentQuestion.options[optionIndex].selected = true;
    this.optionSelected = this.currentQuestion.options[optionIndex];
  } */

  private updateClassName(optionIndex: number): void {
    this.optionSelected.styleClass = this.currentQuestion.options[optionIndex][
      'correct'
    ]
      ? 'correct'
      : 'incorrect';
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
