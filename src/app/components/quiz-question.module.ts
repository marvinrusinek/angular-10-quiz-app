import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';


import { QuizQuestionComponent } from './question/question.component';

@NgModule({
  declarations: [QuizQuestionComponent],
  exports: [QuizQuestionComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatRadioModule,
    MatCheckboxModule
  ]
})
export class QuizQuestionModule { }