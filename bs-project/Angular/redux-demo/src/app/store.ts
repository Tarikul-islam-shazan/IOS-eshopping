import { tassign } from 'tassign';
import { ADDTODO, REMOVETODO } from './action';

export interface TodoInterface{
  id: number;
  title: any;
}

export interface IAppState {
  todos: TodoInterface[],
  lastUpdate: Date,
  size: number
}

export const INITIAL_STATE: IAppState = {
  todos: [],
  lastUpdate: new Date(),
  size : 0
}


export function rootReducer(state: IAppState, action: any): IAppState {
  switch(action.type){
    case ADDTODO:
      var newTodo = { id: state.todos.length + 1, title: action.title};
      return tassign(state,{
        todos : state.todos.concat(newTodo),
        lastUpdate: new Date(),
        size: state.todos.length + 1
      });

    case REMOVETODO:
      return tassign(state,{
        todos : state.todos.filter(s => s.id !== action.todo.id),
        lastUpdate: new Date(),
        size: state.todos.length - 1
      });
  }
  return state;
}
