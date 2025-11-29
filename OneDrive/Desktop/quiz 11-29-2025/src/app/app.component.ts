import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'codelab-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
  questionIndexKey = '';
  showOutlet = true;
  outletKey = '';

  constructor(private router: Router) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      console.log('[🔁 NavigationEnd] Forcing router-outlet reinit');
      this.outletKey = this.router.url;
      const segments = this.router.url.split('/');
      const maybeIndex = segments[segments.length - 1];
      this.questionIndexKey = isNaN(+maybeIndex) ? '' : maybeIndex;

      // Force destroy and recreate router-outlet
      if (this.showOutlet) {
        this.showOutlet = false;
        setTimeout(() => {
          this.showOutlet = true;
        }, 0);
      }
    });
  }
}