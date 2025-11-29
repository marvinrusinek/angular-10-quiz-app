import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
  
import { BackToTopComponent } from '../../components/back-to-top/back-to-top.component';
import { AccordionComponent } from './accordion/accordion.component';
import { ChallengeComponent } from './challenge/challenge.component';
import { ReturnComponent } from './return/return.component';
import { StatisticsComponent } from './statistics/statistics.component';
import { SummaryReportComponent } from './summary-report/summary-report.component';

import { QUIZ_DATA } from '../../shared/quiz';
import { Quiz } from '../../shared/models/Quiz.model';
import { QuizService } from '../../shared/services/quiz.service';
  
@Component({
  selector: 'codelab-quiz-results',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatExpansionModule,
    MatIconModule,
    BackToTopComponent, 
    AccordionComponent, 
    ChallengeComponent,
    ReturnComponent,
    StatisticsComponent,
    SummaryReportComponent
  ],
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResultsComponent implements OnInit, OnDestroy {
  quizData: Quiz[] = QUIZ_DATA;
  quizId = '';
  indexOfQuizId = 0;
  unsubscribe$ = new Subject<void>();
  
  constructor(
    private quizService: QuizService,
    private activatedRoute: ActivatedRoute,
    private router: Router
  ) {
    this.quizService.setPreviousUserAnswersText(
      this.quizService.questions,
      this.quizService.userAnswers
    );
  }
  
  ngOnInit(): void {
    this.fetchQuizIdFromParams();
    this.setCompletedQuiz();
    this.findQuizIndex();
  }
  
  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
  
  private fetchQuizIdFromParams(): void {
    this.activatedRoute.paramMap.pipe(
      takeUntil(this.unsubscribe$)
    ).subscribe(params => {
      this.quizId = params.get('quizId') ?? '';
      this.setCompletedQuiz();
      this.findQuizIndex();
    });
  }
  
  private setCompletedQuiz(): void {
    if (this.quizId) {
      this.quizService.setCompletedQuizId(this.quizId);
    }
  }
  
  private findQuizIndex(): void {
    if (this.quizId) {
      this.indexOfQuizId = this.quizData.findIndex(
        elem => elem.quizId === this.quizId
      );
    }
  }
  
  selectQuiz(): void {
    this.quizService.resetAll();
    this.quizService.resetQuestions();
    this.quizId = '';
    this.indexOfQuizId = 0;
    this.router.navigate(['/select/']);
  }
}