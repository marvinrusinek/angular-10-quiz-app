import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';

import { IntroductionComponent } from './containers/introduction/introduction.component';
import { CodelabDependencyInjectionQuizComponent } from './containers/dependency-injection-quiz/dependency-injection-quiz.component';
import { ResultsComponent } from './containers/results/results.component';

const routes: Route[] = [
  { path: '', redirectTo: 'intro', pathMatch: 'full' },
  { path: 'intro', component: IntroductionComponent, pathMatch: 'full' },
  { path: 'question', component: CodelabDependencyInjectionQuizComponent, pathMatch: 'full' },
  { path: 'question/:index', component: CodelabDependencyInjectionQuizComponent, pathMatch: 'full' },
  { path: 'results', component: ResultsComponent, pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
