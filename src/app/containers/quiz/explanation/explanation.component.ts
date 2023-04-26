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
  @Input() answers: any[] = [];
  explanation: string;

  ngOnInit(): void {
    this.getExplanationText();
  }

  getExplanationText(): string {
    console.log("isAnswered", this.isAnswered);
    console.log("numberOfCorrectAnswers", this.numberOfCorrectAnswers);

    const correctAnswers = this.question.options.filter(
      (option) => option.correct
    );

    const selectedOptions = this.question.options.filter(
      (option) => this.answers.indexOf(option.id) !== -1
    );

    const selectedCorrectOptions = selectedOptions.filter(
      (option) => option.correct
    );

    if (!this.explanationText) {
      throw new Error('No explanation available for this question.');
    }

    if (correctAnswers.length === selectedCorrectOptions.length) {
      this.explanation = this.question.explanationText;
    } else {
      this.explanation = 'Sorry, that is not correct.';
    }

    /* if (this.isAnswered === true) {
      if (this.numberOfCorrectAnswers === 1) {
        return `Option ${this.correctOptions} was correct because ${this.explanationText}`;
      } else {
        return `Options ${this.correctOptions} were correct because ${this.explanationText}`;
      }
    } */

    return '';
  }
}
