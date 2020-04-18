import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable()
export class QuestionsRoutingService {
  questionChange$ = new BehaviorSubject<number>(0);
}
