import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { of } from 'rxjs';

import { QuizMetadata } from '../../../../shared/models/QuizMetadata.model';
import { QuizScore } from '../../../../shared/models/QuizScore.model';

@Component({
  selector: 'codelab-summary-stats',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './summary-stats.component.html',
  styleUrls: ['./summary-stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryStatsComponent {
  @Input() quizMetadata: QuizMetadata | null = { 
    correctAnswersCount$: of(0),
    totalQuestions: 0,
    totalQuestionsAttempted: 0,
    percentage: 0,
    completionTime: 0
  };
  @Input() score!: QuizScore;
  @Input() elapsedMinutes = 0;
  @Input() elapsedSeconds = 0;
}