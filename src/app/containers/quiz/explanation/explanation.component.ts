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
  @Input() explanation: string;
  @Input() answers: any[] = [];
  explanation: string;

  ngOnInit(): void {
    this.getExplanationText();
    console.log("IS ANSWERED:", this.isAnswered);
  }

  getExplanationText(): void {
    try {
      if (this.explanationText) {
        const correctAnswers = this.question.options.filter(option => option.correct);
        const selectedCorrectOptions = this.question.options.filter(option => this.answers.includes(option.text) && option.correct);
        
        if (correctAnswers.length === selectedCorrectOptions.length) {
          this.explanation = this.explanationText;
        } else {
          this.explanation = 'Sorry, that is not correct.';
        }
      }
    } catch (error) {
      console.error('Error occurred while getting explanation text:', error);
    }
  }
}
