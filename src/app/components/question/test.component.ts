import { Component, AfterViewInit, ViewChild, ViewContainerRef } from '@angular/core';

@Component({
  selector: 'app-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.css']
})
export class TestComponent implements AfterViewInit {
  @ViewChild('dynamicComponentContainer', { read: ViewContainerRef, static: true }) dynamicComponentContainer!: ViewContainerRef;

  ngAfterViewInit() {
    console.log('ngAfterViewInit dynamicComponentContainer:', this.dynamicComponentContainer);
    if (this.dynamicComponentContainer) {
      console.log('dynamicComponentContainer initialized');
    } else {
      console.error('dynamicComponentContainer is undefined in ngAfterViewInit');
    }
  }
}
