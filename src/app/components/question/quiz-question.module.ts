import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { QuizQuestionComponent } from './question.component';
import { MultipleAnswerComponent } from './question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from './question-type/single-answer/single-answer.component';
import { FeedbackComponent } from './feedback/feedback.component';
import { OptionFeedbackComponent } from './option-feedback/option-feedback.component';

@NgModule({
  declarations: [
    QuizQuestionComponent,
    MultipleAnswerComponent,
    SingleAnswerComponent,
    FeedbackComponent,
    OptionFeedbackComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatRadioModule,
    MatCheckboxModule
  ],
  entryComponents: [
    MultipleAnswerComponent,
    SingleAnswerComponent,
    FeedbackComponent,
    OptionFeedbackComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class QuizQuestionModule {}
