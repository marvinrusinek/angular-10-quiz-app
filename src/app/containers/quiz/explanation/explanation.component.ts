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
    if (!this.explanationText) {
      throw new Error('No explanation available for this question.');
    }
    
    if (this.numberOfCorrectAnswers === 1) {
      return 'Option ' + this.correctOptions + ' was correct because ' + this.explanationText;
    } else {
      return 'Options ' + this.correctOptions + ' were correct because ' + this.explanationText;
    }
  }  
}
