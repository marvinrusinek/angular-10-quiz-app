import { Component, Input, OnInit } from '@angular/core';
import { animate, style, transition, trigger, keyframes } from '@angular/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { Quiz } from '../../shared/models/Quiz.model';
import { QUIZ_DATA } from '../../shared/quiz';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

type AnimationState = 'animationStarted' | 'none';

@Component({
  selector: 'dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
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
  correctCount: number;
  userAnswers: number[] = [];
  animationState$ = new BehaviorSubject<AnimationState>('none');
  get explanationText(): string { return this.quizService.explanationText; };
  @Input() multipleAnswer: boolean;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit() {
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

    this.correctCount = this.quizService.correctAnswersCountSubject.getValue();
    this.sendCorrectCountToQuizService(this.correctCount);
  }

  sendCorrectCountToQuizService(newValue) {
    this.correctCount = newValue;
    this.quizService.sendCorrectCountToResults(this.correctCount);
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

  previousQuestion() {
    this.answer = null;
    this.animationState$.next('animationStarted');
    this.quizService.previousQuestion();
  }

  restart(): void {
    this.quizService.resetAll();
    this.router.navigate(['/quiz/intro']);
  }

  nextQuestion() {
    this.checkIfAnsweredCorrectly();
    this.answer = null;
    this.animationState$.next('animationStarted');
    this.quizService.nextQuestion();
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
        this.sendCorrectCountToQuizService(this.correctCount + 1);
        this.userAnswers.push(this.answer);
      }
    }
  }
}
