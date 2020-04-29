import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';
import { Observable } from 'rxjs';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../../shared/interfaces/Quiz';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';


@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  providers: [QuizService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultsComponent implements OnInit {
  quizData: Quiz = QUIZ_DATA;
  correctAnswers: [];
  correctAnswersCount: number;
  totalQuestions: number;
  completionTime: number;
  elapsedMinutes: number;
  elapsedSeconds: number;
  codelabUrl = 'https://www.codelab.fun';
  correctCount$: Observable<number>;

  accordionList: any;
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;
  panelOpenState = false;

  get finalAnswers(): Array<number> { return this.quizService.finalAnswers; };
  get percentage(): number { return this.quizService.calculateQuizPercentage(); };
  get elapsedTimes(): Array<number> { return this.timerService.elapsedTimes; };

  CONGRATULATIONS = '../../../assets/images/ng-trophy.jpg';
  NOT_BAD = '../../../assets/images/not-bad.jpg';
  TRY_AGAIN = '../../../assets/images/try-again.jpeg';

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private router: Router
  )
  {
    this.totalQuestions = this.quizService.totalQuestions;
    this.completionTime = this.timerService.completionTime;

    // console.log(this.router.getCurrentNavigation());
    this.correctAnswers = this.router.getCurrentNavigation().extras.state.correctAnswers;
    // this.correctAnswers = this.quizService.correctAnswers;
    this.completionTime = this.router.getCurrentNavigation().extras.state.completionTime;
  }

  ngOnInit() {
    this.correctCount$ = this.quizService.correctAnswersCountSubject;

    this.elapsedMinutes = Math.floor(this.completionTime / 60);
    this.elapsedSeconds = this.completionTime % 60;
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
