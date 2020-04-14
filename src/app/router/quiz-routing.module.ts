import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { IntroductionComponent } from '../containers/introduction/introduction.component';
import { DependencyInjectionQuizComponent } from '../containers/dependency-injection-quiz/dependency-injection-quiz.component';
import { ResultsComponent } from '../containers/results/results.component';

const routes: Routes = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroductionComponent, pathMatch: 'full', data: {animation: 'Introduction'}  },
  { path: 'question', component: DependencyInjectionQuizComponent, pathMatch: 'full', data: {animation: 'Question'} },
  { path: 'question/:questionIndex', component: DependencyInjectionQuizComponent, pathMatch: 'full', data: {animation: 'Question'} },
  { path: 'results', component: ResultsComponent, pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class QuizRoutingModule {}
