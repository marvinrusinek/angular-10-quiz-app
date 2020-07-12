import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { IntroductionComponent } from '../containers/introduction/introduction.component';
import { QuizComponent } from '../containers/quiz/quiz.component';
import { ResultsComponent } from '../containers/results/results.component';

const routes: Routes = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroductionComponent, pathMatch: 'full' },
  { path: 'question', component: QuizComponent, pathMatch: 'full' },
  { path: 'question/:questionIndex', component: QuizComponent, pathMatch: 'full' },
  { path: 'results', component: ResultsComponent, pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class QuizRoutingModule {}
