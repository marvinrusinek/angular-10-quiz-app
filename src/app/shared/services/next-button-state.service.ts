import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { QuizStateService } from '../../shared/services/quizstate.service';
import { SelectedOptionService } from '../../shared/services/selectedoption.service';

@Injectable({ providedIn: 'root' })
export class NextButtonStateService {
  private isButtonEnabledSubject = new BehaviorSubject<boolean>(false);
  public isButtonEnabled$ = this.isButtonEnabledSubject.asObservable();

  public nextButtonTooltip$ = this.isButtonEnabled$.pipe(
    map((enabled) => (enabled ? 'Next' : 'Please select an option to continue...')),
    distinctUntilChanged()
  );

  public nextButtonStyle: { [key: string]: string } = {
    opacity: '0.5',
    cursor: 'not-allowed',
    'pointer-events': 'auto'  // always allow click events
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
    this.updateAndSyncNextButtonState(isEnabled);
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
        map(([answered, loading, navigating]) => answered && !loading && !navigating),
        distinctUntilChanged()
      )
      .subscribe((enabled: boolean) => {
        this.updateAndSyncNextButtonState(enabled);
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
    this.updateAndSyncNextButtonState(shouldEnable);
    return shouldEnable;
  }

  public updateAndSyncNextButtonState(isEnabled: boolean): void {
    this.ngZone.run(() => {
      this.isEnabled = isEnabled;
      this.isButtonEnabledSubject.next(isEnabled);
      this.nextButtonStyle = {
        opacity: isEnabled ? '1' : '0.5',
        cursor: isEnabled ? 'pointer' : 'not-allowed',
        'pointer-events': 'auto'  // keep always enabled
      };
    });
  }

  public setNextButtonState(enabled: boolean): void {
    this.isEnabled = enabled;
    this.isButtonEnabledSubject.next(enabled);
  }

  public getNextButtonState(): Observable<boolean> {
    return this.isButtonEnabledSubject.asObservable();
  }

  public isButtonCurrentlyEnabled(): boolean {
    return this.isEnabled;
  }

  reset(): void {
    this.setNextButtonState(false);
  }
}