import { NgRedux, select } from '@angular-redux/store';
import { Component } from '@angular/core';
import { IAppState } from './store';

export interface Item {
  id: number;
  value: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  @select() counter: any;


  constructor(private ngRedux: NgRedux<IAppState>) {
  }
}
