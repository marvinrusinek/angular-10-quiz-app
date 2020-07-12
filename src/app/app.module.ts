import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { QuizRoutingModule } from './router/quiz-routing.module';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

import { AppComponent } from './app.component';
import { IntroductionComponent } from './containers/introduction/introduction.component';
import { QuizQuestionComponent } from './components/question/question.component';
import { QuizComponent } from './containers/quiz/quiz.component';
import { ResultsComponent } from './containers/results/results.component';
import { ScoreboardComponent } from './containers/scoreboard/scoreboard.component';
import { ScoreComponent } from './containers/scoreboard/score/score.component';
import { TimeComponent } from './containers/scoreboard/time/time.component';
import { QuizService } from './shared/services/quiz.service';
import { TimerService } from './shared/services/timer.service';
import { JoinPipe } from './pipes/join.pipe';

@NgModule({
  declarations: [
    AppComponent,
    IntroductionComponent,
    QuizQuestionComponent,
    QuizComponent,
    ResultsComponent,
    ScoreboardComponent,
    ScoreComponent,
    TimeComponent,
    JoinPipe
  ],
  imports: [
    CommonModule,
    BrowserAnimationsModule,
    QuizRoutingModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatTooltipModule,
    NgbModule,
    FontAwesomeModule
  ],
  exports: [MatExpansionModule],
  bootstrap: [AppComponent],
  providers: [QuizService, TimerService],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class AppModule { }
