import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-test',
  templateUrl: './test.component.html'
})
export class TestComponent implements AfterViewInit {
  @ViewChild('testContainer', { static: true }) testContainer!: ElementRef;

  ngAfterViewInit() {
    console.log('ngAfterViewInit triggered');
    if (this.testContainer) {
      console.log('ngAfterViewInit testContainer:', this.testContainer);
    } else {
      console.error('testContainer is undefined');
    }
  }
}
