import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-summary-stats',
  templateUrl: './summary-stats.component.html',
  styleUrls: ['./summary-stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SummaryStatsComponent {
  @Input() quizPercentage: number;
}
