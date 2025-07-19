import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';

import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class NextButtonStateService {
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  public isButtonEnabled$: Observable<boolean> = this.isButtonEnabledSubject.asObservable().pipe(
    shareReplay(1)
  );

  public nextButtonTooltip$ = this.isButtonEnabled$.pipe(
    map((enabled) => (enabled ? 'Next' : 'Please select an option to continue...')),
    distinctUntilChanged()
  );

  public nextButtonStyle: { [key: string]: string } = {
    opacity: '0.5',
    'pointer-events': 'none'
  };

  private nextButtonStateSubscription?: Subscription;

  private isEnabled = false;
  private initialized = false;

  constructor(
    private quizStateService: QuizStateService,
    private selectedOptionService: SelectedOptionService,
    private ngZone: NgZone
  ) {}

  ngOnDestroy(): void {
    this.cleanupNextButtonStateStream();
  }

  public syncNextButtonState(): void {
    const isAnswered = this.selectedOptionService.getAnsweredState();
    const isLoading = this.quizStateService.isLoadingSubject.getValue();
    const isNavigating = this.quizStateService.isNavigatingSubject.getValue();
  
    const isEnabled = isAnswered && !isLoading && !isNavigating;
    this.setNextButtonState(isEnabled);
  }

  public initializeNextButtonStateStream(
    isAnswered$: Observable<boolean>,
    isLoading$: Observable<boolean>,
    isNavigating$: Observable<boolean>
  ): void {
    if (this.initialized) {
      console.warn('[🛑 initializeNextButtonStateStream] Already initialized');
      return;
    }
    this.initialized = true;

    this.nextButtonStateSubscription = combineLatest([isAnswered$, isLoading$, isNavigating$])
      .pipe(
        distinctUntilChanged(([a1, b1, c1], [a2, b2, c2]) => 
          a1 === a2 && b1 === b2 && c1 === c2
        )
      )
      .subscribe(([isAnswered, isLoading, isNavigating]) => {
        const isEnabled = isAnswered && !isLoading && !isNavigating;
        this.setNextButtonState(isEnabled);
      });
  }

  public cleanupNextButtonStateStream(): void {
    this.nextButtonStateSubscription?.unsubscribe();
    this.nextButtonStateSubscription = undefined;
    this.initialized = false;
  }

  public evaluateNextButtonState(
    isAnswered: boolean,
    isLoading: boolean,
    isNavigating: boolean
  ): boolean {
    const shouldEnable = isAnswered && !isLoading && !isNavigating;
    this.setNextButtonState(shouldEnable);
    return shouldEnable;
  }

  public setNextButtonState(enabled: boolean): void {
    this.isEnabled = enabled;
    this.isButtonEnabledSubject.next(enabled);
    this.nextButtonStyle = {
      opacity: enabled ? '1' : '0.5',
      'pointer-events': enabled ? 'auto' : 'none'
    };
  }  

  public isButtonCurrentlyEnabled(): boolean {
    return this.isEnabled;
  }

  public getNextButtonState(): Observable<boolean> {
    return this.isButtonEnabledSubject.asObservable();
  }
}