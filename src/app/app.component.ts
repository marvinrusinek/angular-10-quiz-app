import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'codelab-root',
  // templateUrl: './app.component.html',
  template: `<codelab-question-multiple-answer></codelab-question-multiple-answer>`,
  styleUrls: [ './app.component.scss' ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent  {
}
