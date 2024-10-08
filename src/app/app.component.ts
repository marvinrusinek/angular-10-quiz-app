import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'codelab-root',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
  constructor() {
    // Override console.error to log the stack trace
    const originalError = console.error;
    console.error = function() {
      originalError.apply(console, arguments);
      console.log('Stack trace:', new Error().stack);
    };
  }
}
