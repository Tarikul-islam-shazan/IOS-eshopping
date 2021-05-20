import { ADDTODO, REMOVETODO } from './../action';
import { NgRedux, select } from '@angular-redux/store';
import { Component, OnInit } from '@angular/core';
import { IAppState, TodoInterface } from '../store';

@Component({
  selector: 'app-todos',
  templateUrl: './todos.component.html',
  styleUrls: ['./todos.component.css']
})
export class TodosComponent implements OnInit {
  todoTitle: any;
  @select(state => state.todos) todos$: any;

  constructor(private ngRedux: NgRedux<IAppState>) { }

  ngOnInit(): void {
  }

  todoAddOperation() {
    if(!this.todoTitle) return ;
    this.ngRedux.dispatch({ type: ADDTODO, title: this.todoTitle});
    this.todoTitle = '';
  }

  todoDeleteOperation(todo: TodoInterface) {
    this.ngRedux.dispatch({ type: REMOVETODO, todo: todo});
  }

}
