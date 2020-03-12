import { Component, Input, Output, OnInit } from '@angular/core';

import { QuizQuestion } from '../../models/QuizQuestion';
import { QuizService } from '../../services/quiz.service';


@Component({
  selector: 'dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [QuizService]
})
export class DependencyInjectionQuizComponent implements OnInit {
  @Output() question: QuizQuestion;
  @Output() answer: number;
  @Output() totalQuestions: number;
  @Output() hasAnswer: boolean;
  @Output() showExplanation: boolean;
  @Output() questionIndex = 0;
  @Input() progressValue: number;
  correctAnswers = [];

  constructor(private quizService: QuizService) {}

  ngOnInit() {
    this.question = this.quizService.getQuestion;
    this.totalQuestions = this.quizService.numberOfQuestions();
    this.mapCorrectAnswersAndCorrectOptions();
  }

  mapCorrectAnswersAndCorrectOptions() {
    for (let j = 0; j < this.question.options.length; j++) {
      if (this.question.options[j].correct === true) {
        this.correctAnswers.push('Question ' + this.questionIndex++ + ', Options: ' + j++);
      }
    }
    // console.log(this.correctAnswers);
  }

  answerChanged($event) {
    this.answer = $event;
  }
}
