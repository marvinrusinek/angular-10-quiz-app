import { Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';
import { Quiz } from '../models/quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';


@Injectable({
  providedIn: 'root'
})
export class QuizService {
  quizData: Quiz = QUIZ_DATA;
  question: QuizQuestion;
  answer: number;
  correctAnswersCount: number;
  totalQuestions: number;
  completionTime: number;
  answered: boolean;
  correctAnswer: boolean;
  progressValue: number;

  questionIndex = 0;
  questionID = 1;
  percentage: number;
  finalAnswers = [];
  correctAnswerText: string;
  correctAnswers = [];
  matRadio: boolean;
  

  constructor(
    private timerService: TimerService,
    private router: Router,
    private route: ActivatedRoute) {
    /* this.route.paramMap.subscribe(params => {
      this.setQuestionIndex(+params.get('questionText'));
      this.question = this.getQuestion;
    }); */
  }

  addCorrectIndexesToCorrectAnswerOptionsArray(optionIndex: number): void {
    if (this.question.options[optionIndex]['correct'] === true) {
      this.correctAnswers = [...this.correctAnswers, optionIndex + 1]; //store the correct option numbers
      console.log("CorAns: " + this.correctAnswers);
    }
  }

  setCorrectAnswerText() {
    if (this.correctAnswers.length === 1) {
      this.correctAnswerText = "The correct answer is Option " + this.correctAnswers[0];
      console.log(this.correctAnswerText);
    }

    if (this.correctAnswers.length > 1) {
      if (this.correctAnswers[0] && this.correctAnswers[1]) {
        this.correctAnswerText = "The correct answers are Options " + this.correctAnswers[0].concat(' and ', this.correctAnswers[1]); 
        console.log(this.correctAnswerText);
      }
      if (this.correctAnswers[0] && this.correctAnswers[1] && this.correctAnswers[2]) {
        this.correctAnswerText = "The correct answers are Options " + this.correctAnswers[0].concat(', ', this.correctAnswers[1], ' and ', this.correctAnswers[2]);
      }
    }

    // highlight all correct answers at the same time (using mat-checkbox)
    // sort the correct answers in numerical order 1 & 2 instead of 2 & 1
    // once the correct answer(s) are selected, pause quiz and prevent any other answers from being selected,
    // display "Move on to next question...") or somehow animate the next button so it's obvious to move to the next question
  }

  getCorrectAnswerText() {
    return this.correctAnswerText;
  }

  // checks whether the question is valid and is answered correctly
  checkIfAnsweredCorrectly() {
    this.answered = true;
    this.question = this.getQuestion;

    // check if the selected option is equal to the correct answer
    if (this.question.options['selected'] === this.question.options['correct']) {
      this.timerService.stopTimer();
      this.correctAnswer = true;

      // need to check if there's more than one answer and if all selected answers are correct
      this.correctAnswersCount++;
      // this.timerService.quizDelay(3000);
      this.timerService.addElapsedTimeToElapsedTimes();
      this.addFinalAnswerToFinalAnswers();
      this.timerService.resetTimer();
      this.navigateToNextQuestion();
    } else {
      this.answered = false;
      this.correctAnswer = false;
    }
  }

  calculateQuizPercentage() {
    this.percentage = Math.round(100 * this.correctAnswersCount / this.totalQuestions);
  }

  addFinalAnswerToFinalAnswers() {
    this.finalAnswers = [...this.finalAnswers, this.answer];
  }

  increaseProgressValue() {
    this.progressValue = parseFloat((100 * (this.getQuestionIndex() + 1) / this.totalQuestions).toFixed(1));
  }

  nextQuestion() {
    this.questionID++;
    this.navigateToNextQuestion();
    this.timerService.resetTimer();
    this.increaseProgressValue();
  }

  navigateToNextQuestion(): void {
    this.router.navigate(['/question', this.questionID]);
  }

  navigateToResults(): void {
    this.router.navigate(['/results'], {
      state:
        {
          questions: this.quizData.questions,
          results: {
            correctAnswers: this.correctAnswers,
            completionTime: this.completionTime
          }
        }
    });
  }

  /*
  *  public API for service
  */
  getQuiz() {
    return this.quizData;
  }

  getQuestionIndex() {
    return this.questionIndex;
  }

  setQuestionIndex(idx: number) {
    return this.questionIndex = idx;
  }

  numberOfQuestions() {
    return this.quizData.questions.length;
  }

  isThereAnotherQuestion(): boolean {
    return this.questionIndex <= this.numberOfQuestions();
  }

  isFinalQuestion(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  get getQuestion(): QuizQuestion {
    return this.quizData.questions[this.questionIndex];
  }

  // if the question has a single answer, use mat-radio-button in the form, else use mat-checkbox in the form
  getQuestionType(): boolean {
    return this.correctAnswers.length === 1;
  }
}
