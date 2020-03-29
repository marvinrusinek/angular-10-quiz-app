import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
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
  quizData: Quiz = QUIZ_DATA;
  question: QuizQuestion;
  answer: number;
  totalQuestions: number;
  questionIndex: number;
  hasAnswer: boolean;
  progressValue: number;
  explanationOptionsText: string;
  disabled: boolean;
  questionID: any;

  constructor(private quizService: QuizService,
              private timerService: TimerService,
              private route: ActivatedRoute,
              private router: Router) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      console.log(params);
      if (params.questionID) {
        this.questionID = params.questionID;
        this.getQuestion();
      }
    });

    if (this.questionID === '1') {
      this.quizService.correctAnswersCount.next(0);
    }

    this.totalQuestions = this.quizService.numberOfQuestions();
    this.progressValue = (this.questionID / this.totalQuestions) * 100;
    this.explanationOptionsText = this.quizService.explanationOptionsText;
  }

  private getQuestion() {
    this.question = this.quizService.quizData.questions[parseInt(this.questionID, 0) - 1];
    this.explanationOptionsText = this.question.explanation;
  }

  selectedAnswer(data) {
    this.answer = data;
  }

  nextQuestion() {
    this.router.navigate(['/question', parseInt(this.questionID, 0) + 1]);
    this.checkIfAnsweredCorrectly();
  }

  results() {
    this.checkIfAnsweredCorrectly();
    this.router.navigate(['/results'], {
      state: {
        questions: this.quizService.quizData,
        results: {
          correctAnswers: this.quizService.correctAnswers,
          completionTime: this.quizService.completionTime
        }
      }
    });
  }

  checkIfAnsweredCorrectly() {
    if (this.question) {
      if (this.question.options && this.question.options['selected'] === this.question.options['correct']) {
        let count;
        this.quizService.correctAnswer$.subscribe(data => {
          count = data + 1;
          console.log('count: ', count);
        });
        this.quizService.correctAnswersCount.next(count);
        this.quizService.addFinalAnswerToFinalAnswers();

        this.quizService.finalAnswers = [...this.quizService.finalAnswers, this.answer];
        this.timerService.resetTimer();
      }
    }
  }
}
