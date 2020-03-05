import { Component, Input, Output, OnInit } from '@angular/core';

import { QUIZ_DATA } from '../../quiz';
import { Quiz } from '../../models/Quiz';
import { QuizService } from '../../services/quiz.service';
import { TimerService } from '../../services/timer.service';
import { QuizQuestion } from '../../models/QuizQuestion';

@Component({
  selector: 'codelab-dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [ QuizService, TimerService ]
})
export class CodelabDependencyInjectionQuizComponent implements OnInit {
  @Output() question: QuizQuestion;
  @Output() answer: number;
  @Output() totalQuestions: number;
  @Output() correctAnswersCount:number = 0;
  @Output() timeLeft: number;
  @Output() hasAnswer: boolean;
  @Output() badgeQuestionNumber: number;
  @Output() showExplanation: boolean;
  @Input() progressValue: number;

  // @ViewChild('questionElem') questionElem: ElementRef;
  correctAnswers = [];
  completionTime: number;
  percentage: number;

  correctAnswer: boolean;
  answered: boolean;
  disabled: boolean;

  quizData = QUIZ_DATA;  // initialize the quiz data object

  constructor(
    private quizService: QuizService,
    private timerService: TimerService) {
  }

  ngOnInit() {
    console.log(this.quizData.questions[this.questionIndex].questionText);
    this.question = this.getQuestion;  // pass the question object to question component
    this.badgeQuestionNumber = this.quizData.questions[this.questionIndex];
    this.totalQuestions = this.quizData.questions.length;
    this.mapCorrectAnswersAndCorrectOptions();
  }

  mapCorrectAnswersAndCorrectOptions() {
    // console.log(this.quizData);
    for (let i = 1; i <= this.quizData.questions.length; i++) {
      for (let j = 1; j <= this.quizData.questions[i].options.length; j++) {
        if (this.quizData.questions[i].options[j]["correct"] === true) {
          this.correctAnswers.push("Question " + i + ", Options: " + j);
        }
      }
    }
    //console.log(this.correctAnswers);
  }

  answerChanged($event) {
    this.answer = $event;
  }

  // checks whether the question is valid and is answered correctly
  checkIfAnsweredCorrectly(optionIndex: number) {
    this.answered = true;
    this.hasAnswer = true;

    // check if the selected option is equal to the correct answer
    if (this.quizData.questions[this.questionIndex].options[optionIndex]['selected'] ===
      this.quizData.questions[this.questionIndex].options[optionIndex]['correct']) {
      this.showExplanation = true;
      this.timerService.stopTimer();
      this.correctAnswer = true;
      this.correctAnswersCount++;
      this.timerService.quizDelay(3000);
      this.timerService.addElapsedTimeToElapsedTimes();
      this.quizService.addFinalAnswerToFinalAnswers();
      this.timerService.resetTimer();
      this.quizService.navigateToNextQuestion();
    } else {
      this.showExplanation = true;
      this.answered = false;
      this.hasAnswer = false;
      this.correctAnswer = false;
    }
  }

  displayNextQuestion() {
    this.timerService.resetTimer();                         // reset the timer
    this.quizService.increaseProgressValue();               // increase the progress value
    this.questionIndex++;                                   // increase the question index by 1

    if (this.questionIndex <= this.totalQuestions) {
      this.badgeQuestionNumber++;               // increase the question number for the badge by 1
    }

    /* if (this.quizService.isThereAnotherQuestion()) {
      this.displayNextQuestionText();     // display the text for the next question
    } else {
      this.navigateToResults();           // navigate to the results page
    } */
  }

  /* displayNextQuestionText() {
    if (this.questionIndex < this.totalQuestions) {
      // this.questionElem.nativeElement.innerHTML = this.DIQuiz.questions[this.questionIndex++]["questionText"];
    } else {
      this.quizService.navigateToResults();           // navigate to results
    }
  } */
}
