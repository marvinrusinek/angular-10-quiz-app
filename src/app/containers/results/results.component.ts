import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizResource } from '../../shared/models/QuizResource.model';
import { QuizMetadata } from '../../shared/models/QuizMetadata.model';
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
  quizData: Quiz[] = JSON.parse(JSON.stringify(QUIZ_DATA));
  quizResources: QuizResource[] = JSON.parse(JSON.stringify(QUIZ_RESOURCES));

  quizMetadata: Partial<QuizMetadata> = {
    totalQuestions: this.quizService.totalQuestions,
    correctAnswersCount$: this.quizService.correctAnswersCountSubject,
    percentage: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
    completionTime: this.timerService.calculateTotalElapsedTime(this.timerService.elapsedTimes)
  };
  results: Result = {
    userAnswers: this.quizService.userAnswers,
    elapsedTimes: this.timerService.elapsedTimes
  };

  quizName = '';
  quizId: string;
  indexOfQuizId: number;
  
  correctAnswers: number[] = [];
  elapsedMinutes: number;
  elapsedSeconds: number;

  @ViewChild('accordion', { static: false }) accordion: MatAccordion;
  panelOpenState = false;

  CONGRATULATIONS = '../../assets/images/congratulations.jpg';
  NOT_BAD = '../../assets/images/notbad.jpg';
  TRY_AGAIN = '../../assets/images/tryagain.jpeg';
  codelabUrl = 'https://www.codelab.fun';

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.indexOfQuizId = this.quizData.findIndex(el => el.quizId === this.quizId);
    this.calculateElapsedTime();
  }

  ngOnInit() {
    this.activatedRoute.url.subscribe(segments => {
      this.quizName = segments[1].toString();
    });
    this.correctAnswers = this.quizService.correctAnswers;
  }

  calculateElapsedTime(): void {
    this.elapsedMinutes = Math.floor(this.quizMetadata.completionTime / 60);
    this.elapsedSeconds = this.quizMetadata.completionTime % 60;
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.ceil(100 * this.quizService.correctAnswersCountSubject.value / this.quizService.totalQuestions);
  }

  checkIfAnswersAreCorrect(correctAnswers, userAnswers, index: number): boolean {
    return !(!userAnswers[index] || 
             userAnswers[index].length === 0 || 
             userAnswers[index].find((answer) => correctAnswers[index][0].indexOf(answer) === -1));
  }

  openAllPanels() {
    this.accordion.openAll();
  }
  closeAllPanels() {
    this.accordion.closeAll();
  }

  restartQuiz() {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.timerService.elapsedTimes = [];
    this.timerService.completionTime = 0;
    this.router.navigate(['/intro']).then();
  }

  selectQuiz() {
    this.router.navigate(['/select']).then();
  }
}
