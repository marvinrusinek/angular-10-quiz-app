import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { IntroductionComponent } from './containers/introduction/introduction.component';
import { DependencyInjectionQuizComponent } from './containers/dependency-injection-quiz/dependency-injection-quiz.component';
import { ResultsComponent } from './containers/results/results.component';

const routes: Route[] = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroductionComponent, pathMatch: 'full' },
  { path: 'question', component: DependencyInjectionQuizComponent, pathMatch: 'full' },
  { path: 'question/:questionID', component: DependencyInjectionQuizComponent, pathMatch: 'full' },
  { path: 'results', component: ResultsComponent, pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class QuizRoutingModule {}
