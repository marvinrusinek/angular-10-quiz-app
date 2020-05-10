import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';
import { Observable } from 'rxjs';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
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

  panelOpenState = false;
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;

  get finalAnswers(): Array<number> { return this.quizService.finalAnswers; };
  // get elapsedTimes(): Array<number> { return this.timerService.elapsedTimes; };
  // NEED TO GET ELAPSED TIMES FROM TIMER COMPONENT

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private router: Router
  )
  {
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
    // this.elapsedMinutes = Math.floor(this.timerService.completionTime / 60);
    // this.elapsedSeconds = this.timerService.completionTime % 60;
  }

  percentageOfCorrectlyAnsweredQuestions(): number {
    return this.percentage = Math.ceil(100 * this.correctAnswersCount / this.totalQuestions);
  }

  closeAllPanels() {
    this.Accordion.closeAll();
  }
  openAllPanels() {
    this.Accordion.openAll();
  }

  restart() {
    this.quizService.resetAll();  // need to reset the answers to empty/null
    this.router.navigate(['/intro']);
  }
}

/* export class QuizMetadata {
  correctAnswers: [];
  totalQuestions: number;
  completionTime: number;
  correctAnswersCount: number;
  percentage: number;
} */
