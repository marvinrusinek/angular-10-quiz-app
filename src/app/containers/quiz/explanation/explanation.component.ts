import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-quiz-explanation',
  templateUrl: './explanation.component.html',
  styleUrls: ['./explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizExplanationComponent implements OnInit {
  @Output() explanationTextChange = new EventEmitter<string>();
  @Input() question: QuizQuestion;
  @Input() questions: QuizQuestion[];
  @Input() isAnswered: boolean = false;
  @Input() questionText: string = '';
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string = '';
  @Input() explanation: string;
  @Input() answers: any[] = [];
  explanationText: string;

  ngOnInit(): void {
    this.getExplanationText();
    console.log("IS ANSWERED:", this.isAnswered);
  }

  getExplanationText(): void {
    try {
      if (this.question?.explanation) {
        const correctOptions = this.question.options.filter(option => option.correct);
        const selectedCorrectOptions = this.question.options.filter(option => this.answers.includes(option.text) && option.correct);
  
        if (correctOptions.length === selectedCorrectOptions.length) {
          const correctOptionsText = correctOptions.map(option => option.text);
  
          if (correctOptions.length === 1) {
            this.explanationText = `Option ${correctOptionsText[0]} is correct because ${this.question.explanation}`;
          } else if (correctOptions.length > 1) {
            const lastOption = correctOptionsText.pop();
            const correctOptionsString = correctOptionsText.join(', ') + ' and ' + lastOption;
            if (correctOptions.length === this.question.options.length) {
              this.explanationText = `All options (${correctOptionsString}) are correct because ${this.question.explanation}`;
            } else {
              this.explanationText = `Options ${correctOptionsString} are correct because ${this.question.explanation}`;
            }
          }
        } else {
          this.explanationText = 'Sorry, that is not correct.';
        }
      }
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
    }
  }
}
