import { Injectable, Input, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from '../services/timer.service';
import { NavigationService } from '../services/navigation.service';

@Injectable({
  providedIn: 'root'
})
export class QuizService {
  @Input() question;
  @Input() answer;
  @Input() correctAnswersCount;
  @Input() totalQuestions;
  @Input() correctAnswers;
  @Input() completionTime;
  @Output() progressValue: number;

  questionIndex: number = 0;
  questionID: number = 1;
  percentage: number;
  finalAnswers = [];

  @Input() answered: boolean;
  @Input() hasAnswer: boolean;
  @Input() correctAnswer: boolean;
  @Input() showExplanation: boolean;
  @Input() badgeQuestionNumber: number;

  quizData = QUIZ_DATA;

  constructor(
    private timerService: TimerService,
    private navigationService: NavigationService) {}

  getQuiz() {
    return this.quizData;
  }

// checks whether the question is valid and is answered correctly
  checkIfAnsweredCorrectly(optionIndex: number) {
    this.answered = true;
    this.hasAnswer = true;

    // check if the selected option is equal to the correct answer
    if (this.question.options[optionIndex].selected === this.question.options[optionIndex].correct) {
      this.showExplanation = true;
      this.timerService.stopTimer();
      this.correctAnswer = true;
      this.correctAnswersCount++;
      this.timerService.quizDelay(3000);
      this.timerService.addElapsedTimeToElapsedTimes();
      this.addFinalAnswerToFinalAnswers();
      this.timerService.resetTimer();
      this.navigationService.navigateToNextQuestion();
    } else {
      this.showExplanation = true;
      this.answered = false;
      this.hasAnswer = false;
      this.correctAnswer = false;
    }
  }

  displayNextQuestion() {
    this.timerService.resetTimer();                         // reset the timer
    this.increaseProgressValue();               // increase the progress value
    this.questionIndex++;                                   // increase the question index by 1

    if (this.questionIndex <= this.totalQuestions) {
      this.badgeQuestionNumber++;               // increase the question number for the badge by 1
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

  /*
  *  public API for service
  */
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
    return this.questionIndex <= this.quizData.questions.length;
  }

  isFinalQuestion(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  get getQuestion(): QuizQuestion {
    return this.quizData.questions[this.questionIndex];
  }

  /* get getQuestion(): QuizQuestion {
    return this.quizData.questions.filter(
      question => question.index === this.questionIndex
    )[0];
  } */

  nextQuestion(): void {
    this.questionID++;
    console.log(this.questionID);
    this.navigationService.navigateToNextQuestion();
  }

  previousQuestion(): void {
    this.questionID--;
    // this.navigationService.navigateToPreviousQuestion();
  }
}
