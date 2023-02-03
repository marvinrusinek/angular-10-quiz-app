import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-summary-icons',
  templateUrl: './summary-icons.component.html',
  styleUrls: ['./summary-icons.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryIconsComponent {
  @Input() quizPercentage: number;
}
