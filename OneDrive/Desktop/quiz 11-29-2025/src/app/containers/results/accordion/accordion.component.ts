import { ChangeDetectionStrategy, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatAccordion, MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { JoinPipe } from '../../../pipes/join.pipe';
import { QuizQuestion } from '../../../shared/models/QuizQuestion.model';
import { Result } from '../../../shared/models/Result.model';
import { QuizService } from '../../../shared/services/quiz.service';
import { TimerService } from '../../../shared/services/timer.service';

@Component({
  selector: 'codelab-results-accordion',
  standalone: true,
  imports: [CommonModule, MatExpansionModule, MatIconModule, JoinPipe],
  templateUrl: './accordion.component.html',
  styleUrls: ['./accordion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccordionComponent implements OnInit {
  questions: QuizQuestion[] = [];
  correctAnswers: number[] = [];
  results: Result = {
    userAnswers: this.quizService.userAnswers,
    elapsedTimes: this.timerService.elapsedTimes
  };

  @ViewChild('accordion', { static: false })
  accordion!: MatAccordion;
  panelOpenState = false;
  isOpen = false;

  constructor(
    private quizService: QuizService,
    private timerService: TimerService
  ) { }

  ngOnInit(): void {
    this.questions = this.quizService.questions;
    this.correctAnswers = Array.from(this.quizService.correctAnswers.values()).flat();

    // Normalize userAnswers so Angular can always iterate
    if (this.results?.userAnswers) {
      this.results.userAnswers = this.results.userAnswers.map((ans) =>
        Array.isArray(ans) ? ans : [ans]
      );
    }
  }

  /* checkIfAnswersAreCorrect(correctAnswers: any, userAnswers: any, index: number): boolean {
    return !(
      !userAnswers[index] ||
      userAnswers[index].length === 0 ||
      userAnswers[index].find((answer: string) =>
        correctAnswers[index].answers[0].indexOf(answer) === -1
      )
    );
  } */
  checkIfAnswersAreCorrect(
    correctAnswers: number[],
    userAnswers: any[],
    index: number
  ): boolean {
    const user = userAnswers[index];
  
    // Handle no answers case
    if (!user || (Array.isArray(user) && user.length === 0)) {
      return false;
    }
  
    // Normalize user answers to an array
    const userArr = Array.isArray(user) ? user : [user];

    // Normalize correct answers to an array
    const correctArr = Array.isArray(correctAnswers)
      ? correctAnswers
      : [correctAnswers];
  
    // Check if every user-selected answer is in the correct set,
    // and if counts match (no extra guesses)
    const allMatch = userArr.every((ans: number) => correctArr.includes(ans));
    const sameLength = userArr.length === correctArr.length;
  
    return allMatch && sameLength;
  }

  openAllPanels(): void {
    this.isOpen = true;
    (this.accordion as any).openAll();
  }
  closeAllPanels(): void {
    this.isOpen = false;
    (this.accordion as any).closeAll();
  }
}
