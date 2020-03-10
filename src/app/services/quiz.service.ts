import { Injectable, Input, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { QUIZ_DATA } from '../quiz';
import { QuizQuestion } from '../models/QuizQuestion';
import { TimerService } from './timer.service';


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
  @Input() answered: boolean;
  @Input() hasAnswer: boolean;
  @Input() correctAnswer: boolean;
  @Input() showExplanation: boolean;
  @Output() progressValue: number;

  questionIndex = 0;
  questionID = 0;
  percentage: number;
  finalAnswers = [];

  quizData = QUIZ_DATA;   // copy the quiz data object

  constructor(
    private timerService: TimerService,
    private router: Router,
    private route: ActivatedRoute) {
    this.route.paramMap.subscribe(params => {
      this.setQuestionIndex(+params.get('questionID'));
      this.question = this.getQuestion;
    });
  }

  // checks whether the question is valid and is answered correctly
  checkIfAnsweredCorrectly() {
    this.answered = true;
    this.hasAnswer = true;
    this.question = this.getQuestion;

    // check if the selected option is equal to the correct answer
    if (this.question.options.selected === this.question.options.correct) {
      this.showExplanation = true;
      this.timerService.stopTimer();
      this.correctAnswer = true;

      // need to check if there's more than one answer (correctAnswers.length > 1) and all selected answers are correct
      this.correctAnswersCount++;
      // this.timerService.quizDelay(3000);
      this.timerService.addElapsedTimeToElapsedTimes();
      this.addFinalAnswerToFinalAnswers();
      this.timerService.resetTimer();
      this.navigateToNextQuestion(this.questionID);
    } else {
      this.showExplanation = true;
      this.answered = false;
      this.hasAnswer = false;
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
    return this.questionIndex <= this.quizData.questions.length;
  }

  isFinalQuestion(): boolean {
    return this.questionIndex === this.totalQuestions;
  }

  get getQuestion(): QuizQuestion {
    return this.quizData.questions[this.questionIndex];
  }

  nextQuestion(): void {
    this.questionIndex;
    this.questionID;
    this.navigateToNextQuestion(this.questionID);
    this.timerService.resetTimer();
    this.increaseProgressValue();
  }

  navigateToNextQuestion(questionID): void {
    this.router.navigate(['/question', questionID]);
  }

  navigateToResults(): void {
    this.router.navigate(['/quiz/results'], {
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
}
