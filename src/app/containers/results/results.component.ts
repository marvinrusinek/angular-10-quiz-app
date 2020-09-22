import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatAccordion } from '@angular/material/expansion';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { QUIZ_DATA, QUIZ_RESOURCES } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
// import { QuizResource } from '../../shared/models/QuizResource.model';
// import { Resource } from '@codelab-quiz/shared/models/Resource.model';
import { QuizMetadata } from '../../shared/models/QuizMetadata.model';
import { Result } from '../../shared/models/Result.model';
import { Score } from '../../shared/models/Score.model';
import { QuizService } from '../../shared/services/quiz.service';
import { TimerService } from '../../shared/services/timer.service';

enum Status {
  Started = 'Started',
  Continue = 'Continue',
  Completed = 'Completed'
}

@Component({
  selector: 'codelab-quiz-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss']
})
export class ResultsComponent implements OnInit {
  quizData: Quiz[] = QUIZ_DATA;
  // quizzes$: Observable<Quiz[]>;
  // quizResources: QuizResource[] = QUIZ_RESOURCES;
  quizMetadata: Partial<QuizMetadata> = {
    totalQuestions: this.quizService.totalQuestions,
    totalQuestionsAttempted: this.quizService.totalQuestions, // same as totalQuestions since next button is disabled
    correctAnswersCount$: this.quizService.correctAnswersCountSubject,
    percentage: this.calculatePercentageOfCorrectlyAnsweredQuestions(),
    completionTime: this.timerService.calculateTotalElapsedTime(this.timerService.elapsedTimes)
  };
  results: Result = {
    userAnswers: this.quizService.userAnswers,
    elapsedTimes: this.timerService.elapsedTimes
  };
  questions: QuizQuestion[];
  quizName$: Observable<string>;
  quizId: string;
  indexOfQuizId: number;
  status: Status;
  correctAnswers: number[] = [];
  previousUserAnswers: any[] = [];
  elapsedMinutes: number;
  elapsedSeconds: number;
  checkedShuffle: boolean;
  highScores: Score[] = [];
  score: Score;

  @ViewChild('accordion', { static: false }) accordion: MatAccordion;
  panelOpenState = false;

  CONGRATULATIONS = '../../assets/images/congrats.gif';
  NOT_BAD = '../../assets/images/not-bad.jpg';
  TRY_AGAIN = '../../assets/images/try-again.jpeg';
  codelabUrl = 'https://www.codelab.fun';

  constructor(
    private quizService: QuizService,
    private timerService: TimerService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.status = Status.Completed;
    this.quizId = this.activatedRoute.snapshot.paramMap.get('quizId');
    this.indexOfQuizId = this.quizData.findIndex(elem => elem.quizId === this.quizId);

    this.sendQuizStatusToQuizService();
    this.sendCompletedQuizIdToQuizService();
    this.sendPreviousUserAnswersToQuizService();
    this.calculateElapsedTime();
    this.saveHighScores();
  }

  ngOnInit(): void {
    // this.quizzes$ = getQuizzes$;
    this.quizName$ = this.activatedRoute.url.pipe(map(segments => segments[1] + ''));
    this.questions = this.quizService.questions;
    this.correctAnswers = this.quizService.correctAnswers;
    this.checkedShuffle = this.quizService.checkedShuffle;
    this.previousUserAnswers = this.quizService.userAnswers;
  }

  calculateElapsedTime(): void {
    this.elapsedMinutes = Math.floor(this.quizMetadata.completionTime / 60);
    this.elapsedSeconds = this.quizMetadata.completionTime % 60;
  }

  calculatePercentageOfCorrectlyAnsweredQuestions(): number {
    return Math.ceil(100 * this.quizService.correctAnswersCountSubject.getValue() / this.quizService.totalQuestions);
  }

  checkIfAnswersAreCorrect(correctAnswers: any, userAnswers: any, index: number): boolean {
    return !(!userAnswers[index] ||
             userAnswers[index].length === 0 ||
             userAnswers[index].find((answer) => correctAnswers[index][0].indexOf(answer) === -1));
  }

  saveHighScores(): void {
    this.score = {
      quizId: this.quizId,
      score: this.quizService.correctAnswersCountSubject.getValue(),
      datetime: new Date()
    };

    const MAX_LENGTH = 2;
    // if (this.quizId === this.quizName$) {
      this.highScores = new Array(MAX_LENGTH);
    // }

    // TODO: checked, error doesn't get thrown if quiz is taken more than 2 times; perhaps need to use localstorage
    if (this.quizId && this.highScores.length > MAX_LENGTH) {
      console.log('ERROR: ' + this.quizData[this.indexOfQuizId].milestone + ' can only be taken ' + MAX_LENGTH + ' times');
    }
    this.highScores.push(this.score);
    console.log('High Scores:', this.highScores);
  }

  openAllPanels(): void {
    this.accordion.openAll();
  }
  closeAllPanels(): void {
    this.accordion.closeAll();
  }

  restartQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.timerService.elapsedTimes = [];
    this.timerService.completionTime = 0;
    this.router.navigate(['/quiz/intro/', this.quizId]).then();
  }

  selectQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.quizId = '';
    this.indexOfQuizId = 0;
    this.router.navigate(['/quiz/select/']).then();
  }

  private sendQuizStatusToQuizService(): void {
    this.quizService.setQuizStatus(this.status);
  }

  private sendCompletedQuizIdToQuizService(): void {
    this.quizService.setCompletedQuizId(this.quizId);
  }

  private sendPreviousUserAnswersToQuizService(): void {
    this.quizService.setPreviousUserAnswers(this.previousUserAnswers);
  }

}
