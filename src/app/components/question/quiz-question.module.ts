import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { QuizQuestionComponent } from './question.component';
import { MultipleAnswerComponent } from './question-type/multiple-answer/multiple-answer.component';
import { SingleAnswerComponent } from './question-type/single-answer/single-answer.component';

@NgModule({
  declarations: [
    QuizQuestionComponent,
    MultipleAnswerComponent,
    SingleAnswerComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatCheckboxModule
  ],
  entryComponents: [
    MultipleAnswerComponent,
    SingleAnswerComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class QuizQuestionModule {}
