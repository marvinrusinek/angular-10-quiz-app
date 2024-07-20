import { Component, AfterViewInit, ViewChild, ViewContainerRef } from '@angular/core';

@Component({
  selector: 'app-test',
  templateUrl: './test.component.html'
})
export class TestComponent implements AfterViewInit {
  @ViewChild('testContainer', { read: ViewContainerRef, static: true }) testContainer!: ViewContainerRef;

  ngAfterViewInit() {
    console.log('ngAfterViewInit testContainer:', this.testContainer);
  }
}
