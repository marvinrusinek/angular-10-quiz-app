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
  completionTime: number;
  elapsedMinutes: number;
  elapsedSeconds: number;
  codelabUrl = 'https://www.codelab.fun';
  userAnswersResults: Result[];

  correctAnswers: number[] = [];
  userAnswers: number[] = [];
  elapsedTimes: number[] = [];

  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;
  panelOpenState = false;

  CONGRATULATIONS = "../../assets/images/congratulations.jpg";
  NOT_BAD = '../../assets/images/notbad.jpg';
  TRY_AGAIN = '../../assets/images/tryagain.jpeg';

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private router: Router
  ) {
    // this.userAnswersResults = new Result(this.userAnswers, this.elapsedTimes);
    // this.resultsMap = [this.userAnswers[], this.elapsedTimes];
    this.totalQuestions = quizService.totalQuestions;
    this.calculatePercentageOfCorrectlyAnsweredQuestions();
    this.calculateElapsedTime();
  }

  ngOnInit() {
    this.correctAnswers = this.quizService.correctAnswers;
    this.userAnswers = this.quizService.userAnswers;
    this.elapsedTimes = this.timerService.elapsedTimes;
    this.completionTime = this.timerService.completionTime;
    console.log('comp time: ', this.completionTime);
    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
  }

  calculateElapsedTime(): void {
    this.completionTime = this.timerService.calculateTotalElapsedTime(this.timerService.elapsedTimes);
    console.log(this.elapsedTimes);
    console.log('completionTime: ', this.completionTime);

    this.elapsedMinutes = Math.floor(this.completionTime / 60);
    this.elapsedSeconds = this.completionTime % 60;

    console.log('elapsedMinutes: ', this.elapsedMinutes);
    console.log('elapsedSeconds: ', this.elapsedSeconds);
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): void {
    this.percentage = Math.ceil(100 * this.quizService.correctAnswersCountSubject.value / this.totalQuestions);
  }

  openAllPanels() {
    this.Accordion.openAll();
  }
  closeAllPanels() {
    this.Accordion.closeAll();
  }

  restart() {
    this.quizService.resetAll();
    this.router.navigate(['/intro']);
  }
}
