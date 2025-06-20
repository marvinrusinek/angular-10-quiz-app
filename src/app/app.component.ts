import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'codelab-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
  questionIndexKey = '';

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      const segments = this.router.url.split('/');
      const maybeIndex = segments[segments.length - 1];
      this.questionIndexKey = isNaN(+maybeIndex) ? '' : maybeIndex;
      console.log('[✅ questionIndexKey]', this.questionIndexKey);
    });
  }
}
