import { NgModule, NO_ERRORS_SCHEMA, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { QuizRoutingModule } from './router/quiz-routing.module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule, MatRadioModule, MAT_RADIO_DEFAULT_OPTIONS, MatIconModule, MatButtonModule, MatExpansionModule } from '@angular/material';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { AppComponent } from './app.component';
import { IntroductionComponent } from './containers/introduction/introduction.component';
import { QuizQuestionComponent } from './components/question/question.component';
import { DependencyInjectionQuizComponent } from './containers/dependency-injection-quiz/dependency-injection-quiz.component';
import { ResultsComponent } from './containers/results/results.component';
import { ScoreboardComponent } from './containers/scoreboard/scoreboard.component';
import { ScoreComponent } from './containers/scoreboard/score/score.component';
import { TimerComponent } from './containers/scoreboard/timer/timer.component';
import { QuizService } from './shared/services/quiz.service';
import { TimerService } from './shared/services/timer.service';

@NgModule({
  declarations: [
    AppComponent,
    IntroductionComponent,
    QuizQuestionComponent,
    DependencyInjectionQuizComponent,
    ResultsComponent,
    ScoreboardComponent,
    ScoreComponent,
    TimerComponent
  ],
  imports: [
    CommonModule,
    BrowserAnimationsModule,
    QuizRoutingModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    NgbModule,
    FontAwesomeModule
  ],
  bootstrap: [AppComponent],
  providers: [QuizService, TimerService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule { }
