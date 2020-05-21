import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';
import { Observable } from 'rxjs';

import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { Result } from '../../shared/models/Result.model';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';


@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultsComponent implements OnInit {
  quizData: Quiz = QUIZ_DATA;
  totalQuestions: number;
  percentage: number;
  correctAnswersCount$: Observable<number>;
  completionTime$: Observable<number>;
  elapsedMinutes: number;
  elapsedSeconds: number;
  codelabUrl = 'https://www.codelab.fun';
  Math: Math = Math;
  resultsMap: Result; // = new Result(this.finalAnswers, this.elapsedTimes);

  get correctAnswers(): Array<number> { return this.quizService.correctAnswers };
  // get userAnswers from di-quiz-comp!
  elapsedTimes: number[]; // get elapsed times from timer component
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;
  panelOpenState = false;

  CONGRATULATIONS = "../../assets/images/congratulations.jpg";
  NOT_BAD = '../../assets/images/notbad.jpg';
  TRY_AGAIN = '../../assets/images/tryagain.jpeg';

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private router: Router
  )
  {
    console.log('results corr ans: ', this.correctAnswers);
    // this.resultsMap = [this.userAnswers[], this.elapsedTimes];
    this.totalQuestions = quizService.totalQuestions;
    this.percentageOfCorrectlyAnsweredQuestions();
    this.calculateElapsedTime();
  }

  ngOnInit() {
    console.log('correct answers', this.correctAnswers);
    // console.log('user answers', this.userAnswers);

    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
    this.completionTime$ = this.timerService.completionTimeSubject;
    console.log('completionTime: ', this.completionTime$);
  }

  // possibly get rid of, already being calculated in the view
  percentageOfCorrectlyAnsweredQuestions(): void {
    this.percentage = Math.ceil(100 * this.quizService.correctAnswersCountSubject.value / this.totalQuestions);
  }

  calculateElapsedTime() {
    this.elapsedMinutes = this.timerService.completionTimeSubject.value / 60;
    this.elapsedSeconds = this.timerService.completionTimeSubject.value % 60;
  }

  openAllPanels() {
    this.Accordion.openAll();
  }
  closeAllPanels() {
    this.Accordion.closeAll();
  }

  restart() {
    this.quizService.resetAll();
    this.router.navigate(['/quiz/intro']);
  }
}
