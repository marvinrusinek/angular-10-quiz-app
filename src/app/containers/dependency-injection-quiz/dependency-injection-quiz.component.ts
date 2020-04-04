import {Component, ChangeDetectionStrategy, Input, OnInit, SimpleChanges} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

import { QUIZ_DATA } from '../../quiz';
import { Quiz } from '../../models/quiz';
import { QuizQuestion } from '../../models/QuizQuestion';
import { QuizService } from '../../services/quiz.service';
import { TimerService } from '../../services/timer.service';


@Component({
  selector: 'dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [QuizService, TimerService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DependencyInjectionQuizComponent implements OnInit {
  explanationText: string;

  quizData: Quiz = QUIZ_DATA;
  question: QuizQuestion;
  answer: number;
  totalQuestions: number;
  progressValue: number;
  questionIndex: number;
  count: number;

  get explanation(): string { return this.quizService.explanationText; }
  @Input() set explanation(value: string) { this.quizService.explanationText = value; }

  constructor(private quizService: QuizService,
              private timerService: TimerService,
              private route: ActivatedRoute) {
    this.explanationText = this.explanation;
    console.log('exptxt: ' + this.explanationText);
  }

  ngOnInit() {
    this.quizService.correctAnswer$.subscribe(data => {
      this.count = data + 1;
    });

    this.route.params.subscribe(params => {
      this.totalQuestions = this.quizService.numberOfQuestions();

      if (params.questionIndex) {
        this.questionIndex = parseInt(params.questionIndex, 0);
        this.quizService.currentQuestionIndex = this.questionIndex;
        this.getQuestion();

        if (this.questionIndex === 1) {
          this.progressValue = 0;
        } else {
          this.progressValue = ((this.questionIndex - 1) / this.totalQuestions) * 100;
        }
      }
    });

    if (this.questionIndex === 1) {
      this.quizService.correctAnswersCount.next(0);
    }

    this.explanationText = this.explanation;
  }

  private getQuestion() {
    this.question = this.quizService.getQuestions().questions[this.questionIndex - 1];
    // this.explanationText = this.question.explanation;
  }

  selectedAnswer(data) {
    this.answer = data;
  }

  nextQuestion() {
    this.checkIfAnsweredCorrectly();
    this.quizService.nextQuestion();
  }

  results() {
    this.checkIfAnsweredCorrectly();
    this.quizService.navigateToResults();
  }

  checkIfAnsweredCorrectly() {
    if (this.question) {
      if (this.question.options &&
          this.question.options[this.answer] &&
          this.question.options[this.answer]['selected'] &&
          this.question.options[this.answer]['correct']
      ) {
        this.quizService.correctAnswersCount.next(this.count);
        this.quizService.finalAnswers = [...this.quizService.finalAnswers, this.answer];
        this.timerService.resetTimer();
      } else {
        console.log('Inside else...');
      }
    }
  }
}
