import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'codelab-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
  questionIndexKey = '';

  constructor(private router: Router, private route: ActivatedRoute) {
    this.router.events.subscribe(() => {
      const segments = this.router.url.split('/');
      const maybeIndex = segments[segments.length - 1];
      this.questionIndexKey = maybeIndex;
    });
  }
}
