import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';

import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';

@Component({
  selector: 'codelab-quiz-explanation',
  templateUrl: './explanation.component.html',
  styleUrls: ['./explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizExplanationComponent implements OnInit {
  @Input() question: QuizQuestion;
  @Input() questions: QuizQuestion[];
  @Input() isAnswered: boolean = false;
  @Input() questionText: string = '';
  @Input() numberOfCorrectAnswers: number;
  @Input() correctOptions: string = '';
  @Input() explanationText: string;
  @Input() answers: any[] = [];
  explanation: string;

  ngOnInit(): void {
    console.log("QEC check");
    console.log("explanationText", this.explanationText);
    this.getExplanationText();
  }

  getExplanationText(): string {
    try {
      if (this.question?.explanation) {
        const correctAnswers = this.question.options.filter(option => option.correct);
        const selectedCorrectOptions = this.question.options.filter(option => this.answers.includes(option.text) && option.correct);
        
        if (correctAnswers.length === selectedCorrectOptions.length) {
          return this.question.explanation;
        } else {
          return 'Sorry, that is not correct.';
        }
      } else {
        return '';
      }
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
      return '';
    }
  }
}
