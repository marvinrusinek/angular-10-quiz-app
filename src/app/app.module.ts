import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { QuizRoutingModule } from './router/quiz-routing.module';
import { QuizQuestionModule } from './components/question/quiz-question.module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { AppComponent } from './app.component';
import { IntroductionComponent } from './containers/introduction/introduction.component';
import { QuizComponent } from './containers/quiz/quiz.component';
import { QuizExplanationComponent } from './containers/quiz/explanation/explanation.component';
import { QuizSelectionComponent } from './containers/quiz-selection/quiz-selection.component';
import { ResultsComponent } from './containers/results/results.component';
import { ScoreboardComponent } from './containers/scoreboard/scoreboard.component';
import { ScoreComponent } from './containers/scoreboard/score/score.component';
import { TimeComponent } from './containers/scoreboard/time/time.component';
import { AccordionComponent } from './containers/results/accordion/accordion.component';
import { ReturnComponent } from './containers/results/return/return.component';
import { StatisticsComponent } from './containers/results/statistics/statistics.component';
import { SummaryReportComponent } from './containers/results/summary-report/summary-report.component';
import { SummaryIconsComponent } from './containers/results/summary-report/summary-icons/summary-icons.component';
import { SummaryStatsComponent } from './containers/results/summary-report/summary-stats/summary-stats.component';
import { ChallengeComponent } from './containers/results/challenge/challenge.component';
import { QuizDataService } from './shared/services/quizdata.service';
import { QuizStateService } from './shared/services/quizstate.service';
import { TimerService } from './shared/services/timer.service';
import { CountdownService } from './shared/services/countdown.service';
import { StopwatchService } from './shared/services/stopwatch.service';
import { JoinPipe } from './pipes/join.pipe';

@NgModule({
  declarations: [
    AppComponent,
    IntroductionComponent,
    QuizComponent,
    QuizExplanationComponent,
    QuizSelectionComponent,
    ResultsComponent,
    ScoreboardComponent,
    ScoreComponent,
    TimeComponent,
    AccordionComponent,
    ReturnComponent,
    StatisticsComponent,
    SummaryReportComponent,
    SummaryIconsComponent,
    SummaryStatsComponent,
    ChallengeComponent,
    JoinPipe
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    QuizRoutingModule,
    QuizQuestionModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatTooltipModule,
    MatGridListModule,
    MatMenuModule,
    MatToolbarModule,
    NgbModule,
    FontAwesomeModule,
  ],
  exports: [MatExpansionModule],
  bootstrap: [AppComponent],
  providers: [
    QuizDataService,
    QuizStateService,
    TimerService,
    CountdownService,
    StopwatchService,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}
