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
import { IonicModule } from '@ionic/angular';
import { AngMusicPlayerModule } from 'ang-music-player';

import { AppComponent } from './app.component';
import { IntroductionComponent } from './containers/introduction/introduction.component';
import { QuizComponent } from './containers/quiz/quiz.component';
import { QuizQuestionComponent } from './components/question/question.component';
import { BaseQuestionComponent } from './components/question/base-question.component';
import { SharedOptionComponent } from './components/question/question-type/shared-option.component';
import { MultipleAnswerComponent } from './components/question/question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from './components/question/question-type/single-answer/single-answer.component';
import { FeedbackComponent } from './components/question/feedback/feedback.component';
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
import { HighlightOptionDirective } from './directives/highlight-option.directive';
import { ResetBackgroundDirective } from './directives/reset-background.directive';
import { QuizService } from './shared/services/quiz.service';
import { QuizDataService } from './shared/services/quizdata.service';
import { QuizQuestionManagerService } from './shared/services/quizquestionmgr.service';
import { QuizResolverService } from './shared/services/quiz-resolver.service';
import { QuizStateService } from './shared/services/quizstate.service';
import { DynamicComponentService } from './shared/services/dynamic-component.service';
import { ExplanationTextService } from './shared/services/explanation-text.service';
import { SelectedOptionService } from './shared/services/selectedoption.service';
import { SelectionMessageService } from './shared/services/selection-message.service';
import { TimerService } from './shared/services/timer.service';
import { CountdownService } from './shared/services/countdown.service';
import { StopwatchService } from './shared/services/stopwatch.service';
import { ResetBackgroundService } from './shared/services/reset-background.service';
import { ResetStateService } from './shared/services/reset-state.service';
import { SharedVisibilityService } from './shared/services/shared-visibility.service';
import { JoinPipe } from './pipes/join.pipe';
import { QuizGuard } from './router/guards/quiz.guard';

@NgModule({
  declarations: [
    AppComponent,
    IntroductionComponent,
    QuizQuestionComponent,
    BaseQuestionComponent,
    QuizComponent,
    SharedOptionComponent,
    MultipleAnswerComponent,
    SingleAnswerComponent,
    FeedbackComponent,
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
    HighlightOptionDirective,
    ResetBackgroundDirective,
    JoinPipe
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    HttpClientModule,
    RouterModule,
    QuizRoutingModule,
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
    AngMusicPlayerModule,
    IonicModule.forRoot()
  ],
  exports: [
    HighlightOptionDirective,
    ResetBackgroundDirective,
    MatExpansionModule
  ],
  bootstrap: [AppComponent],
  entryComponents: [
    MultipleAnswerComponent,
    SingleAnswerComponent
  ],
  providers: [
    QuizGuard,
    QuizService,
    QuizDataService,
    QuizQuestionManagerService,
    QuizResolverService,
    QuizStateService,
    DynamicComponentService,
    ExplanationTextService,
    ResetBackgroundService,
    ResetStateService,
    SelectedOptionService,
    SelectionMessageService,
    TimerService,
    CountdownService,
    StopwatchService,
    SharedVisibilityService
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}

