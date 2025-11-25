import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { IntroductionComponent } from '../containers/introduction/introduction.component';
import { QuizComponent } from '../containers/quiz/quiz.component';
import { QuizSelectionComponent } from '../containers/quiz-selection/quiz-selection.component';
import { ResultsComponent } from '../containers/results/results.component';
import { QuizResolverService } from '../shared/services/quiz-resolver.service';
import { QuizGuard } from './guards/quiz.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'select',
    pathMatch: 'full'
  },
  {
    path: 'select',
    component: QuizSelectionComponent
  },
  {
    path: 'intro/:quizId',
    component: IntroductionComponent
  },
  {
    path: 'question/:quizId/:questionIndex',
    component: QuizComponent,
    canActivate: [QuizGuard],
    resolve: { 
      quizData: QuizResolverService
    },
    runGuardsAndResolvers: 'always'
  },
  {
    path: 'results/:quizId',
    component: ResultsComponent
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { 
      enableTracing: false, 
      onSameUrlNavigation: 'reload',
      // scrollPositionRestoration: 'enabled'
      scrollPositionRestoration: 'disabled',
      paramsInheritanceStrategy: 'always'
    })
  ],
  exports: [RouterModule]
})
export class QuizRoutingModule {
  constructor() {}
}