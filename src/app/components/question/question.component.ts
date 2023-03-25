import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
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
export abstract class QuizQuestionComponent implements OnInit, OnChanges {
  private quizService: QuizService;
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
  // multipleAnswer: boolean;
  alreadyAnswered = false;
  optionList: Option[];
  selectedOption: Option;
  hasSelectedOptions = false;
  answers;
  quizId: string;
  correctOptionIndex: number;
  options: Option[];
  shuffleOptions = true;
  isChangeDetected = false;

  private multipleAnswerSubject = new BehaviorSubject<boolean>(false);
  multipleAnswer$ = this.multipleAnswerSubject.asObservable();

  private _multipleAnswer: boolean;

  get multipleAnswer(): boolean {
    return this.quizService.isMultipleAnswer(this.question);
  }

  set multipleAnswer(value: boolean) {
    this._multipleAnswer = value;
  }

  constructor(
    quizService: QuizService,
    private quizDataService: QuizDataService,
    private timerService: TimerService,
    public activatedRoute: ActivatedRoute,
    private cdRef: ChangeDetectorRef
  ) {
    this.quizService = quizService;
    this.correctMessage = '';
    this.multipleAnswer = false;
  }

  async ngOnInit(): Promise<void> {
    console.log('ngOnInit called');
    this.currentQuestionIndex = 0;

    this.activatedRoute.params.subscribe(async (params) => {
      if (params && params.id) {
        this.quizId = params['quizId'];
        this.quizDataService.setSelectedQuiz(null);
        this.quizDataService.getQuiz(this.quizId).subscribe(async (quiz) => {
          if (quiz) {
            this.quizDataService.setSelectedQuiz(quiz);
            this.quizDataService.setCurrentQuestionIndex(0);
            const [question, options] = await this.quizDataService
              .getQuestionAndOptions(this.quizId, 0)
              .toPromise();
            console.log('Question:', question);
            this.question = question;
            if (this.question && this.question.options) {
              this.answers = options.map((option) => option.value) || [];
              this.setOptions();
              this.currentQuestion = question;
              this.quizService.setCurrentQuestion(question);
              this.quizService
                .isMultipleAnswer(this.currentQuestion)
                .subscribe((multipleAnswer) => {
                  this.multipleAnswerSubject.next(multipleAnswer);
                });
              this.correctAnswers =
                this.quizService.getCorrectAnswers(question);
            } else {
              console.error('Question or question options not found');
            }
          } else {
            console.error('Selected quiz not found');
          }
        });
      }
    });

    this.questionForm = new FormGroup({
      answer: new FormControl('', Validators.required),
    });

    this.quizService.currentQuestionSubject.subscribe((currentQuestion) => {
      console.log('currentQuestionSubject emitted:', currentQuestion);
      this.updateCurrentQuestion(this.currentQuestion);
    });

    this.currentQuestion = this.question;
    this.setOptions();
    this.updateCorrectMessage();
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }

  ngDoCheck() {
    if (this.isChangeDetected) {
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.isChangeDetected = false;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (
      (changes.correctAnswers && !changes.correctAnswers.firstChange) ||
      (changes.selectedOptions && !changes.selectedOptions.firstChange)
    ) {
      console.log('CA1::', this.correctAnswers);
      this.correctMessage = this.quizService.setCorrectMessage(
        this.currentQuestion,
        this.correctAnswers
      );
      this.cdRef.detectChanges(); // manually trigger change detection
    }
  }

  getQuestion(index: number): Observable<QuizQuestion> {
    return this.quizDataService.getSelectedQuiz().pipe(
      map((selectedQuiz) => {
        return selectedQuiz.questions[index];
      })
    );
  }

  /* setMultipleAnswer(multipleAnswer: boolean) {
    this.multipleAnswer = multipleAnswer;
  } */

  public incrementScore(): void {
    this.quizService.score++;
  }

  public getCorrectAnswers(): void {
    this.correctAnswers = this.quizService.getCorrectAnswers(
      this.currentQuestion
    );
  }

  private updateCurrentQuestion(question: QuizQuestion): void {
    console.log('UCQ', question);
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

    if (!this.question || !this.question.options) {
      console.error('Question or options not found');
      return;
    }

    const { options, answer } = this.question;
    const { shuffleOptions } = this.selectedQuiz;

    const answerValue = this.question.answer.values().next().value;
    this.correctOptionIndex = options.findIndex(
      (option) => option.value === answerValue
    );

    this.options = options.map(
      (option, index) =>
        ({
          text: option.text,
          correct: index === this.correctOptionIndex,
          value: option.value,
          answer: option.value,
          selected: false,
        } as Option)
    );

    if (shuffleOptions) {
      this.quizService.shuffle(this.options);
    }

    const correctOptions = this.options.filter((option) => option.correct);
    // const correctOptions = this.options?.filter((option) => option.correct) ?? [];
    // this.multipleAnswer = correctOptions?.length > 1;
    this.quizService.setMultipleAnswer(correctOptions.length > 1);

    this.checkIfMultipleAnswer();
    this.quizService.isMultipleAnswer();
  }

  private checkIfMultipleAnswer(): void {
    if (this.options) {
      const correctOptions = this.options.filter((option) => option.correct);
      this.multipleAnswer = correctOptions.length > 1;
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
    if (
      selectedOption &&
      this.currentQuestion &&
      this.currentQuestion.options
    ) {
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
