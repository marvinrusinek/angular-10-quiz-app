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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { IonicModule } from '@ionic/angular';
import { AngMusicPlayerModule } from 'ang-music-player';

import { AppComponent } from './app.component';
import { AnswerComponent } from './components/question/answer/answer-component/answer.component';
import { IntroductionComponent } from './containers/introduction/introduction.component';
import { QuizComponent } from './containers/quiz/quiz.component';
import { QuizQuestionComponent } from './components/question/quiz-question/quiz-question.component';
import { SharedOptionComponent } from './components/question/answer/shared-option-component/shared-option.component';
import { FeedbackComponent } from './components/question/answer/feedback/feedback.component';
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
import { AnswerTrackingService } from './shared/services/answer-tracking.service';
import { NextButtonStateService } from './shared/services/next-button-state.service';
import { QuizService } from './shared/services/quiz.service';
import { QuizDataService } from './shared/services/quizdata.service';
import { QuizInitializationService } from './shared/services/quiz-initialization.service';
import { QuizNavigationService } from './shared/services/quiz-navigation.service';
import { QuizQuestionLoaderService } from './shared/services/quizquestionloader.service';
import { QuizQuestionManagerService } from './shared/services/quizquestionmgr.service';
import { QuizResolverService } from './shared/services/quiz-resolver.service';
import { QuizShuffleService } from './shared/services/quiz-shuffle.service';
import { QuizStateService } from './shared/services/quizstate.service';
import { DynamicComponentService } from './shared/services/dynamic-component.service';
import { ExplanationTextService } from './shared/services/explanation-text.service';
import { FeedbackService } from './shared/services/feedback.service';
import { RenderStateService } from './shared/services/render-state.service';
import { SelectedOptionService } from './shared/services/selectedoption.service';
import { SelectionMessageService } from './shared/services/selection-message.service';
import { TimerService } from './shared/services/timer.service';
import { ProgressBarService } from './shared/services/progress-bar.service';
import { ResetBackgroundService } from './shared/services/reset-background.service';
import { ResetStateService } from './shared/services/reset-state.service';
import { SharedVisibilityService } from './shared/services/shared-visibility.service';
import { JoinPipe } from './pipes/join.pipe';
import { QuizGuard } from './router/guards/quiz.guard';

@NgModule({
  declarations: [
    AppComponent,
    AnswerComponent,
    IntroductionComponent,
    QuizQuestionComponent,
    QuizComponent,
    SharedOptionComponent,
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
    MatProgressSpinnerModule,
    MatSlideToggleModule,
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
    AnswerComponent
  ],
  providers: [
    QuizGuard,
    QuizService,
    QuizDataService,
    QuizInitializationService,
    QuizNavigationService,
    QuizQuestionLoaderService,
    QuizQuestionManagerService,
    QuizResolverService,
    QuizShuffleService,
    QuizStateService,
    AnswerTrackingService,
    DynamicComponentService,
    ExplanationTextService,
    FeedbackService,
    NextButtonStateService,
    RenderStateService,
    ResetBackgroundService,
    ResetStateService,
    SelectedOptionService,
    SelectionMessageService,
    TimerService,
    ProgressBarService,
    SharedVisibilityService
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule {}