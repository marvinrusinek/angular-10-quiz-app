import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { map, share, pairwise, startWith } from 'rxjs/operators';

import { Quiz } from '../../shared/interfaces/Quiz';
import { QUIZ_DATA } from '../../assets/quiz';
import { QuizQuestion } from '../../shared/interfaces/QuizQuestion';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';
import { RouterAnimations } from '../../router/route-animations';
import { QuestionsRoutingService } from '../../shared/services/questions-routing.service';


@Component({
  selector: 'dependency-injection-quiz-component',
  templateUrl: './dependency-injection-quiz.component.html',
  styleUrls: ['./dependency-injection-quiz.component.scss'],
  providers: [QuizService, TimerService, QuestionsRoutingService],
  animations: [RouterAnimations.routeSlide]
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

  // Angular routing animation variables
  questions;
  questionChange$: Observable<number>;
  next$: Observable<number>;
  prev$: Observable<number>;
  routeTrigger$: Observable<object>;


  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private questionsRouting: QuestionsRoutingService,
    private route: ActivatedRoute
  ) {
    this.questions = quizService.getQuestions();
    this.questionChange$ = questionsRouting.questionChange$;
    this.setupRouting();
  }

  sendCountToQuizService(count: number) {
    this.quizService.sendCountToResults(count);
  }

  ngOnInit() {
    this.quizService.correctAnswersCountSubject.subscribe(data => {
      this.count = data + 1;
      this.sendCountToQuizService(this.count);
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
      this.quizService.correctAnswersCountSubject.next(0);
    }
  }

  private getQuestion() {
    this.question = this.quizService.getQuestions().questions[this.questionIndex - 1];
  }

  selectedAnswer(data) {
    this.answer = data;
  }

  nextQuestion() {
    this.checkIfAnsweredCorrectly();
    this.quizService.nextQuestion();
  }

  prevQuestion() {
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
        this.quizService.finalAnswers = [...this.quizService.finalAnswers, this.answer];
      } else {
        console.log('Inside else');
      }
    }
  }

  private setupRouting() {
    this.prev$ = this.questionChange$
      .pipe(
        map(index => index === 0 ? index : index - 1),
        share()
      );
    this.next$ = this.questionChange$
      .pipe(
        map(index => index === this.questions.length - 1 ? index : index + 1),
        share()
      );

    this.routeTrigger$ = this.questionChange$
      .pipe(
        startWith(0),
        pairwise(),
        map(([prev, curr]) => ({
          value: curr,
          params: {
            offsetEnter: prev > curr ? 100 : -100,
            offsetLeave: prev > curr ? -100 : 100
          }
        })),
      );
  }
}
