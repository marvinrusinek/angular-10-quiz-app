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
  correctAnswers: [];
  correctAnswersCount: number;
  totalQuestions: number;
  percentage: number;
  correctAnswersCount$: Observable<number>;
  completionTime$: Observable<number>;
  codelabUrl = 'https://www.codelab.fun';
  Math: Math = Math;
  resultsMap: Result; // = new Result(this.finalAnswers, this.elapsedTimes);

  get finalAnswers(): Array<number> { return this.quizService.finalAnswers; };
  elapsedTimes: number[]; // get elapsed times from timer component
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;
  panelOpenState = false;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private router: Router
  )
  {
    // this.resultsMap = [this.finalAnswers[], this.elapsedTimes];

    this.totalQuestions = quizService.totalQuestions;
    this.correctAnswers = router.getCurrentNavigation().extras.state.correctAnswers;
    this.percentageOfCorrectlyAnsweredQuestions();
  }

  ngOnInit() {
    console.log('final answers', this.finalAnswers);
    console.log('correct answers', this.correctAnswers);

    this.correctAnswersCount$ = this.quizService.correctAnswersCountSubject;
    this.completionTime$ = this.timerService.completionTimeSubject;
    console.log('completionTime: ', this.completionTime$);
  }

  percentageOfCorrectlyAnsweredQuestions(): number {
    return Math.ceil(100 * this.correctAnswersCount / this.totalQuestions);
  }

  closeAllPanels() {
    this.Accordion.closeAll();
  }
  openAllPanels() {
    this.Accordion.openAll();
  }

  restart() {
    this.quizService.resetAll();
    this.router.navigate(['/quiz/intro']);
  }
}

/* export class QuizMetadata {
  correctAnswers: [];
  totalQuestions: number;
  completionTime: number;
  correctAnswersCount: number;
  percentage: number;
} */
