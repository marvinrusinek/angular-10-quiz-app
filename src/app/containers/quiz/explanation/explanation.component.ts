import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'codelab-quiz-explanation',
  templateUrl: './explanation.component.html',
  styleUrls: ['./explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizExplanationComponent implements OnInit {
  @Input() question: any;
  @Input() isAnswered: boolean = false;
  @Input() questionText: string = '';
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string = '';
  @Input() explanationText: string;
  explanation: string;

  ngOnInit(): void {
    this.getExplanationText();
  }

  getExplanationText(): void {
    console.log("isAnswered", this.isAnswered);
    console.log("numberOfCorrectAnswers", this.numberOfCorrectAnswers);
    if (!this.explanationText) {
      throw new Error('No explanation available for this question.');
    }

    if (this.isAnswered === true) {
      if (this.numberOfCorrectAnswers === 1) {
        this.explanation = `Option ${this.correctOptions} was correct because ${this.explanationText}`;
      } else {
        this.explanation = `Options ${this.correctOptions} were correct because ${this.explanationText}`;
      }
    }
  }
}
