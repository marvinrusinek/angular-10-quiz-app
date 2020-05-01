import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';
import { Observable, Subscription } from 'rxjs';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../../shared/models/Quiz';
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
  totalQuestions: number;
  elapsedMinutes: number;
  elapsedSeconds: number;
  percentage: number;
  correctCount$: Observable<number>;
  codelabUrl = 'https://www.codelab.fun';
  
  panelOpenState = false;
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;
  
  get finalAnswers(): Array<number> { return this.quizService.finalAnswers; };
  get elapsedTimes(): Array<number> { return this.timerService.elapsedTimes; };
  get completionTime(): number { return this.timerService.completionTime; };

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
    this.correctAnswers = this.router.getCurrentNavigation().extras.state.correctAnswers;
    this.calculateQuizPercentage();
  }

  ngOnInit() {
    this.correctCount$ = this.quizService.correctAnswersCountSubject;

    this.elapsedMinutes = Math.floor(this.completionTime / 60);
    this.elapsedSeconds = this.completionTime % 60;
  }

  calculateQuizPercentage(): number {
    // trying to convert the observable<number> to number
    let currentCorrectCountSub: Subscription;
    /* currentCorrectCountSub = this.store.select(getCurrentPage).subscribe(
      (count: number) => {
        this.correctCount$ = count;
      }
    ); */

    return this.percentage = (this.correctAnswersCount / this.totalQuestions) * 100;
  }

  closeAllPanels() {
    this.Accordion.closeAll();
  }
  openAllPanels() {
    this.Accordion.openAll();
  }

  restart() {
    this.quizService.resetAll();  // not resetting
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
