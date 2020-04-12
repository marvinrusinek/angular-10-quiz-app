import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';

import { QUIZ_DATA } from '../../assets/quiz';
import { Quiz } from '../../shared/interfaces/Quiz';
import { QuizService } from '../../shared/services/quiz.service';


@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  providers: [QuizService]
})
export class ResultsComponent implements OnInit {
  quizData: Quiz = QUIZ_DATA;
  correctAnswers: [];
  completionTime: number;
  elapsedMinutes: number;
  elapsedSeconds: number;
  codelabUrl = 'https://www.codelab.fun';

  accordionList: any;
  @ViewChild('accordion', { static: false }) Accordion: MatAccordion;

  get totalQuestions(): number { return this.quizService.totalQuestions };
  get correctAnswersCount(): number { return this.scoreService.correctAnswerCount };
  get finalAnswers(): Array<number> { return this.quizService.finalAnswers; };
  get percentage(): number { return this.quizService.calculateQuizPercentage(); };

  CONGRATULATIONS = '../../../assets/images/ng-trophy.jpg';
  NOT_BAD = '../../../assets/images/not-bad.jpg';
  TRY_AGAIN = '../../../assets/images/try-again.jpeg';

  constructor(
    private quizService: QuizService,
    private router: Router
  ) {
    /* this.quizService.sendScore$.subscribe((data) => {
      this.correctAnswersCount = data;
    }); */

    // console.log(this.router.getCurrentNavigation());
    this.correctAnswers = this.router.getCurrentNavigation().extras.state.correctAnswers;
    this.completionTime = this.router.getCurrentNavigation().extras.state.completionTime;
    // this.percentage = this.router.getCurrentNavigation().extras.state.percentage;
  }

  ngOnInit() {
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
