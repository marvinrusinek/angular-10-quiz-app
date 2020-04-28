import { Component, Input, OnInit } from '@angular/core';
import { animate, style, transition, trigger, keyframes } from '@angular/animations';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Quiz } from '../../shared/interfaces/Quiz';
import { QUIZ_DATA } from '../../assets/quiz';
import { QuizQuestion } from '../../shared/interfaces/QuizQuestion';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [QuizService, TimerService],
  animations: [
    trigger('changeRoute', [
      transition('* => animationStarted', [
        animate('1s', keyframes([
          style({ transform: 'scale(1.0)' }),
          style({ transform: 'scale(1.3)' }),
          style({ transform: 'scale(1.0)' })
        ]))
      ]),
    ])
  ]
})
export class DependencyInjectionQuizComponent implements OnInit {
  quizData: Quiz = QUIZ_DATA;
  question: QuizQuestion;
  answer: number;
  totalQuestions: number;
  progressValue: number;
  questionIndex: number;
  count: number;
  @Input() hasAnswer: boolean;
  get explanationText(): string { return this.quizService.explanationText; };
  // get timeLeft(): any { return this.timerService.getTimeLeft$; };

  animationState$ = new BehaviorSubject<AnimationState>('none');

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute
  ) { }

  ngOnInit() {
    this.quizService.correctAnswersCountSubject.subscribe(data => {
      this.count = data + 1;
    });
    this.sendCountToQuizService(this.count);

    this.activatedRoute.params.subscribe(params => {
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
      this.quizService.correctAnswersCountSubject.next(0);
    }
  }

  sendCountToQuizService(count: number) {
    this.quizService.sendCountToResults(count);
  }

  animationDoneHandler(): void {
    this.animationState$.next('none');
  }

  private getQuestion() {
    this.question = this.quizService.getQuestions().questions[this.questionIndex - 1];
  }

  selectedAnswer(data) {
    this.answer = data;
  }

  nextQuestion() {
    this.answer = null;
    this.checkIfAnsweredCorrectly();
    this.animationState$.next('animationStarted');
    this.quizService.nextQuestion();
  }

  prevQuestion() {
    this.answer = null;
    this.animationState$.next('animationStarted');
    this.quizService.prevQuestion();
  }

  results() {
    this.checkIfAnsweredCorrectly();
    this.quizService.navigateToResults();
  }

  checkIfAnsweredCorrectly() {
    if (this.question) {
      if (
        this.question.options &&
        this.question.options[this.answer] &&
        this.question.options[this.answer]['selected'] &&
        this.question.options[this.answer]['correct']
      ) {
        this.quizService.correctAnswersCountSubject.next(this.count);
        this.quizService.addFinalAnswer(this.answer);
      }
    }
  }
}
