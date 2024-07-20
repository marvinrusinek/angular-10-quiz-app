import { Component, AfterViewInit, ViewChild, ViewContainerRef } from '@angular/core';

@Component({
  selector: 'app-test',
  template: `<div #testContainer>Test Container</div>`
})
export class TestComponent implements AfterViewInit {
  @ViewChild('testContainer', { read: ViewContainerRef, static: true }) testContainer!: ViewContainerRef;

  ngAfterViewInit() {
    console.log('ngAfterViewInit triggered');
    if (this.testContainer) {
      console.log('ngAfterViewInit testContainer:', this.testContainer);
    } else {
      console.error('testContainer is undefined');
    }
  }
}
