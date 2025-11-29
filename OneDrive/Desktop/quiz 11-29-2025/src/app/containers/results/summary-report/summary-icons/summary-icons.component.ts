import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Quiz } from '../../../../shared/models/Quiz.model';
import { QuizMetadata } from '../../../../shared/models/QuizMetadata.model';

@Component({
  selector: 'codelab-summary-icons',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-icons.component.html',
  styleUrls: ['./summary-icons.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryIconsComponent {
  @Input() quiz: Quiz | null = null;
  @Input() quizMetadata: QuizMetadata | null = null;
  @Input() quizPercentage = 0;
  @Input() codelabUrl = '';
}