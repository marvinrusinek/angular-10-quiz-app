import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';

import { IntroductionComponent } from './containers/introduction/introduction.component';
import { DependencyInjectionQuizComponent } from './containers/dependency-injection-quiz/dependency-injection-quiz.component';
import { ResultsComponent } from './containers/results/results.component';

const routes: Route[] = [
  { path: '', redirectTo: 'intro' },
  { path: 'intro', component: IntroductionComponent },
  { path: 'question', component: DependencyInjectionQuizComponent },
  { path: 'question/:questionID', component: DependencyInjectionQuizComponent },
  { path: 'results', component: ResultsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QuizRoutingModule {}
