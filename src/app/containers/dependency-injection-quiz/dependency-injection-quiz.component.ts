import { Component, Input, Output, OnInit } from '@angular/core';

import { QUIZ_DATA } from '../../quiz';
import { QuizQuestion } from '../../models/QuizQuestion';
import { NavigationService } from '../../services/navigation.service';
import { QuizService } from '../../services/quiz.service';
import { TimerService } from '../../services/timer.service';

@Component({
  selector: 'codelab-dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [QuizService, TimerService, NavigationService]
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
  correctAnswers = [];
  completionTime: number;
  percentage: number;

  correctAnswer: boolean;
  answered: boolean;

  quizData = QUIZ_DATA;  // initialize the quiz data object

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private navigationService: NavigationService) {}

  ngOnInit() {
    this.question = this.quizService.getQuestion;
    this.totalQuestions = this.quizService.numberOfQuestions();
    this.progressValue = ((this.questionIndex + 1) / this.totalQuestions) * 100;
    this.mapCorrectAnswersAndCorrectOptions();
  }

  mapCorrectAnswersAndCorrectOptions() {
    for (let j = 0; j < this.question.options.length; j++) {
      if (this.question.options["correct"] === true) {
        this.correctAnswers.push("Question " + this.questionIndex++ + ", Options: " + j++);
      }
    }
    // console.log(this.correctAnswers);
  }

  answerChanged($event) {
    this.answer = $event;
  }
}
