import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'codelab-quiz-explanation',
  templateUrl: './explanation.component.html',
  styleUrls: ['./explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizExplanationComponent {
  @Input() isAnswered: boolean = false;
  @Input() questionText: string = '';
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string = '';
  @Input() explanationText: string = '';

  getExplanationText(): string {
    console.log('noca', this.numberOfCorrectAnswers);
    if (!this.isAnswered) {
      return '';
    }

    if (this.numberOfCorrectAnswers === 1) {
      return 'Option ' + this.correctOptions + ' was correct because ' + this.explanationText;
    } else {
      return 'Options ' + this.correctOptions + ' were correct because ' + this.explanationText;
    }
  }
}
