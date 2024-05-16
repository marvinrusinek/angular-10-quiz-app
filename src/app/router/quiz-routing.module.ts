import { NgModule } from '@angular/core';
import { RouterModule, Routes, Router, NavigationStart, NavigationEnd, NavigationError } from '@angular/router';

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
    //path: 'quiz/:quizId/question/:questionIndex',
    path: 'question/:quizId/:questionIndex',
    component: QuizComponent,
    canActivate: [QuizGuard],
    resolve: { quizData: QuizResolverService },
    runGuardsAndResolvers: 'always'
  },
  {
    path: 'results/:quizId',
    component: ResultsComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { enableTracing: false })],
  exports: [RouterModule]
})
export class QuizRoutingModule {
  constructor(private router: Router) {
    this.router.events.subscribe((event: Event) => {
      if (event instanceof NavigationStart) {
        console.log('NavigationStart:', event.url);
      } else if (event instanceof NavigationEnd) {
        console.log('NavigationEnd:', event.url);
      } else if (event instanceof NavigationError) {
        console.error('NavigationError:', event.error);
      }
    });
  }
}
