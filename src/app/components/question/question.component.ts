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
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { QuizDataService } from '../../shared/services/quizdata.service';
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
  currentQuestion$: Observable<QuizQuestion>;
  questionForm: FormGroup;
  selectedQuiz: Quiz;
  optionSelected: Option;
  correctAnswers: number[] = [];
  correctMessage: string = '';
  multipleAnswer: boolean;
  alreadyAnswered = false;
  optionList: Option[];
  selectedOption: Option;
  hasSelectedOptions = false;
  answers;
  quizId: string;
  correctOptionIndex: number;
  options: Option[];
  shuffleOptions = true;

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {
    this.correctMessage = '';
  }

  ngOnInit(): void {
    this.currentQuestionIndex = 0;
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];
      this.quizDataService.setSelectedQuiz(null);
      this.quizDataService.getQuiz(this.quizId).subscribe((quiz) => {
        if (quiz) {
          this.quizDataService.setSelectedQuiz(quiz);
          this.quizDataService.setCurrentQuestionIndex(0);
          this.quizDataService
            .getQuestion(quiz.quizId, 0)
            .subscribe((question) => {
              this.question = question;
              this.answers =
                question?.options.map((option) => option.value) || [];
              this.setOptions();
              this.currentQuestion = question;
              this.quizService.setCurrentQuestion(question);
              this.quizService.isMultipleAnswer(this.currentQuestion).subscribe(multipleAnswer => {
                this.multipleAnswer = multipleAnswer;
                this.sendMultipleAnswerToQuizService(this.multipleAnswer);
              });
              this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
            });
        } else {
          console.error('Selected quiz not found');
        }
      });
    });
  
    this.questionForm = new FormGroup({
      answer: new FormControl('', Validators.required),
    });

    // Check if the question is defined before accessing its options property
    if (this.question && this.question.options) {
      this.answers = this.question.options.map((option) => option.value) || [];
      this.setOptions();
    }
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

  getQuestion(index: number): Observable<QuizQuestion> {
    return this.quizDataService.getSelectedQuiz().pipe(
      map((selectedQuiz) => {
        return selectedQuiz.questions[index];
      })
    );
  }
  
  private updateCurrentQuestion(question: QuizQuestion): void {
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

  setOptions(): void {
    if (!this.selectedQuiz) {
      console.error('Selected quiz not found');
      return;
    }
  
    const { options, answer } = this.question;
    const { shuffleOptions } = this.selectedQuiz;
  
    this.correctOptionIndex = options.findIndex((option) => option === answer);
  
    this.options = options.map((option, index) => ({
      value: option,
      text: option.value.toString(), // update text to be a string
      isCorrect: index === this.correctOptionIndex,
      answer: index === this.correctOptionIndex,
      isSelected: false,
    }));

    if (shuffleOptions) {
      this.quizService.shuffle(this.options);
    }
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
      if (this.currentQuestion && this.currentQuestion.options) {
        this.currentQuestion.options.forEach((option) => {
          option.selected = false;
          option.styleClass = '';
        });
      }
    }
  }

  private updateSelection(optionIndex: number): void {
    const option = this.currentQuestion.options[optionIndex];
    if (option && this.currentQuestion && this.currentQuestion.options) {
      this.currentQuestion.options.forEach((o) => (o.selected = false));
      option.selected = true;
      this.selectedOption = option;
    }
  }

  onOptionSelected(option) {
    this.selectedOption = option;
  }

  private updateClassName(selectedOption: Option, optionIndex: number): void {
    if (selectedOption && this.currentQuestion && this.currentQuestion.options) {
      this.optionSelected.styleClass = this.currentQuestion.options[
        optionIndex
      ]['correct']
        ? 'correct'
        : 'incorrect';
    }
  }

  private playSound(optionIndex: number): void {
    if (this.currentQuestion && this.currentQuestion.options) {
      if (this.currentQuestion.options[optionIndex]['correct']) {
        this.timerService.stopTimer();
        this.quizService.correctSound.play();
      } else {
        this.quizService.incorrectSound.play();
      }
    }
  }

  sendMultipleAnswerToQuizService(multipleAnswer: boolean): void {
    this.quizService.setMultipleAnswer(multipleAnswer);
  }
}
