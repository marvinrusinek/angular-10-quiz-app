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
  @Output() correctAnswersCount: number = 0;
  @Output() timeLeft: number;
  @Output() hasAnswer: boolean;
  @Output() badgeQuestionNumber: number;
  @Output() showExplanation: boolean;
  @Output() questionIndex = 0;
  @Input() progressValue: number;


  // @ViewChild('questionElem') questionElem: ElementRef;
  correctAnswers = [];
  completionTime: number;
  percentage: number;

  correctAnswer: boolean;
  answered: boolean;
  
  quizData = QUIZ_DATA;  // initialize the quiz data object

  constructor(
    private quizService: QuizService,
    private timerService: TimerService) {
  }

  ngOnInit() {
    this.question = this.quizService.getQuestion;
    this.totalQuestions = this.quizService.numberOfQuestions();
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
    // console.log(this.correctAnswers);
  }

  answerChanged($event) {
    this.answer = $event;
  }

  displayNextQuestion() {
    this.timerService.resetTimer();                         // reset the timer
    this.quizService.increaseProgressValue();               // increase the progress value
    this.questionIndex++;                                   // increase the question index by 1

    if (this.questionIndex <= this.totalQuestions) {
      this.badgeQuestionNumber++;               // increase the question number for the badge by 1
    }
  }
}
