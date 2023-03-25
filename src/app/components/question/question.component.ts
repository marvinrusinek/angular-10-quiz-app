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
  questionsAndOptions: [QuizQuestion, Option[]][] = [];
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
    let result = false;
    this.quizService.isMultipleAnswer(this.question).subscribe((res) => {
      result = res;
    });
    return result;
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
    this.currentQuestionIndex = 0;
  
    const quizQuestion = this.selectedQuiz.questions.find(
      (question: any) => question.id === question
    ) as QuizQuestion;
    if (!quizQuestion) {
      console.error('Question not found');
      return;
    }
    
    if (!this.question || !this.question.options) {
      console.error('Question or question options not found');
      return;
    }
  
    this.quizService.getSelectedQuiz().subscribe(
      (quiz: Quiz) => {
        this.selectedQuiz = quiz;
        if (this.selectedQuiz && this.selectedQuiz.questions && this.selectedQuiz.questions.length > 0) {
          this.setOptions();
        } else {
          console.error('Invalid Quiz object');
        }
      },
      (error: any) => {
        console.error(error);
      }
    );

    this.activatedRoute.params.subscribe(async (params) => {
      if (params && params.id) {
        this.quizId = params['quizId'];
        this.quizDataService.setSelectedQuiz(null);
        this.quizDataService.getQuiz(this.quizId).subscribe(async (quiz) => {
          if (quiz) {
            this.quizDataService.setSelectedQuiz(quiz);
            this.quizDataService.setCurrentQuestionIndex(0);
            this.question = quiz.questions[0];
            console.log('Question:', this.question);
            if (this.question && this.question.options) {
              this.answers = this.question.options.map((option) => option.value) || [];
              this.setOptions();
              this.currentQuestion = this.question;
              this.quizService.setCurrentQuestion(this.currentQuestion);
              this.quizService
                .isMultipleAnswer(this.currentQuestion)
                .subscribe((multipleAnswer) => {
                  this.multipleAnswerSubject.next(multipleAnswer);
                });
              this.correctAnswers = this.quizService.getCorrectAnswers(this.question);
              console.log('QuizService Correct Answers:', this.correctAnswers);
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
      this.currentQuestion = currentQuestion;
      this.setOptions();
      this.updateCorrectMessage();
      this.updateCorrectAnswers();
      this.updateMultipleAnswer();
      this.resetForm();
    });

    if (this.question && this.question.options) {
      console.log('Question:', this.question);
      console.log('Options:', this.options);
      this.answers = this.options.map((option) => option.value) || [];
      this.setOptions();
      this.currentQuestion = this.question;
      this.quizService.setCurrentQuestion(this.currentQuestion);
      this.quizService
        .isMultipleAnswer(this.currentQuestion)
        .subscribe((multipleAnswer) => {
          this.multipleAnswerSubject.next(multipleAnswer);
        });
      this.correctAnswers =
        this.quizService.getCorrectAnswers(this.question);
    } else {
      console.error('Question or question options not found');
      console.error('Question:', this.question);
      console.error('Options:', this.options);
    }

    this.updateCorrectMessage();
    this.updateCorrectAnswers();
    this.updateMultipleAnswer();
    this.resetForm();
  }
   
  async getCurrentQuestion(): Promise<void> {
    const questionIndex = this.currentQuestionIndex;
    if (!questionIndex && questionIndex !== 0) {
      this.currentQuestionIndex = 0;
    }
  
    if (this.questionsAndOptions[questionIndex]) {
      const [question, options] = this.questionsAndOptions[questionIndex];
      this.currentQuestion = question;
      this.currentOptions = options;
      return;
    }
  
    const [question, options] = await this.quizDataService
      .getQuestionAndOptions(this.quizId, questionIndex)
      .toPromise();
  
    if (question && options && options.length > 0) {
      this.currentQuestion = question;
      this.currentOptions = options;
      this.questionsAndOptions[questionIndex] = [question, options];
    } else {
      console.error('Question or options array is null or undefined');
      this.currentQuestion = null;
      this.currentOptions = null;
    }
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
      this.question
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

    if (!this.selectedQuiz.questions) {
      console.error('Quiz questions not found');
      return;
    }

    const quizQuestion = this.selectedQuiz.questions[this.currentQuestionIndex];

    if (!quizQuestion) {
      console.error('Question not found');
      return;
    }

    this.options = quizQuestion.options;

    const { options, answer } = quizQuestion;
    const { shuffleOptions } = this.selectedQuiz;

    const answerValue = answer.values().next().value;
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

    const correctOptions = this.options?.filter((option) => option.correct) ?? [];
    this.quizService.setMultipleAnswer(correctOptions.length > 1);
    this.quizService.isMultipleAnswer(quizQuestion);
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
