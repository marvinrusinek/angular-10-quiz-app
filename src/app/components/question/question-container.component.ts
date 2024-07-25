import { Component, Input, ViewChild, ViewContainerRef, AfterViewInit } from '@angular/core';
import { QuizQuestion } from '../../shared/models/QuizQuestion.model';
import { DynamicComponentService } from '../../shared/services/dynamic-component.service';

@Component({
  selector: 'app-question-container',
  template: '<div #dynamicComponentContainer></div>',
  styleUrls: ['./question-container.component.css']
})
export class QuestionContainerComponent implements AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true }) dynamicComponentContainer!: ViewContainerRef;
  @Input() question!: QuizQuestion;

  constructor(private dynamicComponentService: DynamicComponentService) {}

  ngAfterViewInit(): void {
    console.log('QuestionContainerComponent ngAfterViewInit called');
    console.log('question input:', this.question);
    this.loadDynamicComponent();
  }

  async loadDynamicComponent(): Promise<void> {
    const hasMultipleAnswers = this.question.options.filter(option => option.correct).length > 1;
    const componentRef = await this.dynamicComponentService.loadComponent(this.dynamicComponentContainer, hasMultipleAnswers);
    componentRef.instance.question = this.question;
  }
}
