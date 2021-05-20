import { NgRedux, select } from '@angular-redux/store';
import { Component, OnInit } from '@angular/core';
import { IAppState } from '../store';

@Component({
  selector: 'app-todos-dashboard',
  templateUrl: './todos-dashboard.component.html',
  styleUrls: ['./todos-dashboard.component.css']
})
export class TodosDashboardComponent implements OnInit {
  @select() lastUpdate: any;
  @select() size: any;

  constructor(private ngRedux: NgRedux<IAppState>) {}

  ngOnInit(): void {}

}
