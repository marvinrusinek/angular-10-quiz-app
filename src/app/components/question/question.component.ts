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
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { Option } from '../../shared/models/Option.model';
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
  questionForm: FormGroup;
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

  constructor(
    private quizService: QuizService,
    private quizDataService: QuizDataService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) {
    this.correctMessage = '';
  }

  ngOnInit(): void {
    this.activatedRoute.params.subscribe((params) => {
      this.quizId = params['quizId'];
      this.currentQuestionIndex = parseInt(params['questionIndex'], 10);
  
      console.log('QuestionComponent ngOnInit: quizId=', this.quizId, 'currentQuestionIndex=', this.currentQuestionIndex);
  
      this.quizDataService
        .getSelectedQuiz()
        .pipe(
          switchMap((selectedQuiz) => {
            if (selectedQuiz && selectedQuiz.questions.length > 0) {
              this.selectedQuiz = selectedQuiz;
              return this.quizService.getQuestion(selectedQuiz.quizId, this.currentQuestionIndex);
            }
            return of(null);
          })
        )
        .subscribe((question) => {
          console.log('Getting question:', question);
          console.log('current question index:', this.currentQuestionIndex);
          this.question = question;
          this.answers = this.question?.options.map((option) => option.value) || [];
          this.setOptions();
        });
    });
  
    this.questionForm = new FormGroup({
      answer: new FormControl('', Validators.required),
    });
  
    this.currentQuestion = this.quizService.getCurrentQuestion();
    this.answers = this.quizService.getAnswers(this.currentQuestion);
    this.correctAnswers = this.quizService.getCorrectAnswers(this.question);

    this.sendMultipleAnswerToQuizService(this.multipleAnswer);
  }

  getQuestion(index: number): Observable<QuizQuestion> {
    return this.quizDataService.getSelectedQuiz().pipe(
      map((selectedQuiz) => {
        return selectedQuiz.questions[index];
      })
    );
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

  setOptions() {
    const options = this.question.options;
    this.optionList = options.map((option) => {
      return { 
        text: option.value.toString(), 
        value: parseInt(option.optionId), 
        answer: option.correct 
      };
    });
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
