import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { QuizRoutingModule } from './router/quiz-routing.module';
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
import { QuizQuestionComponent } from './components/question/question.component';
import { MultipleAnswerComponent } from './components/question/question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from './components/question/question-type/single-answer/single-answer.component';
import { FeedbackComponent } from './components/question/feedback/feedback.component';
import { OptionFeedbackComponent } from './components/question/option-feedback/option-feedback.component';
import { QuizSelectionComponent } from './containers/quiz-selection/quiz-selection.component';
import { ResultsComponent } from './containers/results/results.component';
import { ScoreboardComponent } from './containers/scoreboard/scoreboard.component';
import { ScoreComponent } from './containers/scoreboard/score/score.component';
import { TimerComponent } from './containers/scoreboard/timer/timer.component';
import { AccordionComponent } from './containers/results/accordion/accordion.component';
import { ReturnComponent } from './containers/results/return/return.component';
import { StatisticsComponent } from './containers/results/statistics/statistics.component';
import { SummaryReportComponent } from './containers/results/summary-report/summary-report.component';
import { SummaryIconsComponent } from './containers/results/summary-report/summary-icons/summary-icons.component';
import { SummaryStatsComponent } from './containers/results/summary-report/summary-stats/summary-stats.component';
import { ChallengeComponent } from './containers/results/challenge/challenge.component';
import { CodelabQuizContentComponent } from './containers/quiz/quiz-content/codelab-quiz-content.component';
import { CodelabQuizHeaderComponent } from './containers/quiz/quiz-header/quiz-header.component';
import { HighlightDirective } from './directives/highlight.directive';
import { ResetBackgroundDirective } from './directives/reset-background.directive';
import { QuizService } from './shared/services/quiz.service';
import { QuizDataService } from './shared/services/quizdata.service';
import { QuizQuestionManagerService } from './shared/services/quizquestionmgr.service';
import { QuizStateService } from './shared/services/quizstate.service';
import { ExplanationTextService } from './shared/services/explanation-text.service';
import { SelectedOptionService } from './shared/services/selectedoption.service';
import { SelectionMessageService } from './shared/services/selection-message.service';
import { TimerService } from './shared/services/timer.service';
import { CountdownService } from './shared/services/countdown.service';
import { StopwatchService } from './shared/services/stopwatch.service';
import { ResetBackgroundService } from './shared/services/reset-background.service';
import { JoinPipe } from './pipes/join.pipe';
import { QuizGuard } from './router/guards/quiz.guard';

@NgModule({
  declarations: [
    AppComponent,
    IntroductionComponent,
    QuizQuestionComponent,
    QuizComponent,
    MultipleAnswerComponent,
    SingleAnswerComponent,
    FeedbackComponent,
    OptionFeedbackComponent,
    QuizSelectionComponent,
    ResultsComponent,
    ScoreboardComponent,
    ScoreComponent,
    TimerComponent,
    AccordionComponent,
    ReturnComponent,
    StatisticsComponent,
    SummaryReportComponent,
    SummaryIconsComponent,
    SummaryStatsComponent,
    ChallengeComponent,
    CodelabQuizContentComponent,
    CodelabQuizHeaderComponent,
    HighlightDirective,
    ResetBackgroundDirective,
    JoinPipe
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    RouterModule,
    QuizRoutingModule,
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
    FontAwesomeModule
  ],
  exports: [
    HighlightDirective,
    MatExpansionModule
  ],
  bootstrap: [AppComponent],
  providers: [
    QuizGuard,
    QuizService,
    QuizDataService,
    QuizQuestionManagerService,
    QuizStateService,
    ExplanationTextService,
    SelectedOptionService,
    SelectionMessageService,
    TimerService,
    CountdownService,
    StopwatchService,
    ResetBackgroundService
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}
