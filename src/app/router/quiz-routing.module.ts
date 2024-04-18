/* import { NgModule } from '@angular/core';
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
    // canActivate: [QuizGuard],
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
export class QuizRoutingModule {} */

import { NgModule, Injectable } from '@angular/core';
import { RouterModule, Routes, RouteReuseStrategy, DetachedRouteHandle, ActivatedRouteSnapshot } from '@angular/router';

import { IntroductionComponent } from '../containers/introduction/introduction.component';
import { QuizComponent } from '../containers/quiz/quiz.component';
import { QuizSelectionComponent } from '../containers/quiz-selection/quiz-selection.component';
import { ResultsComponent } from '../containers/results/results.component';
import { QuizResolverService } from '../shared/services/quiz-resolver.service';
import { QuizGuard } from './guards/quiz.guard';

@Injectable()
class CustomReuseStrategy implements RouteReuseStrategy {
    shouldDetach(route: ActivatedRouteSnapshot): boolean {
        return false;  // Components will not be detached and stored
    }
    store(route: ActivatedRouteSnapshot, detachedTree: DetachedRouteHandle): void {
        // No-op
    }
    shouldAttach(route: ActivatedRouteSnapshot): boolean {
        return false;  // Components stored will not be reattached
    }
    retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
        return null;  // No component to retrieve
    }
    shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
        return future.routeConfig === curr.routeConfig &&
               future.params['quizId'] === curr.params['quizId'] &&
               future.params['questionIndex'] === curr.params['questionIndex'];
    }
}

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
    // canActivate: [QuizGuard],
    resolve: { quizData: QuizResolverService },
    runGuardsAndResolvers: 'always'
  },
  {
    path: 'results/:quizId',
    component: ResultsComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: [{ provide: RouteReuseStrategy, useClass: CustomReuseStrategy }]
})
export class QuizRoutingModule {}

