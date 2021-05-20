import { NgModule, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NgRedux, NgReduxModule, DevToolsExtension } from '@angular-redux/store';
import { IAppState, INITIAL_STATE, rootReducer } from './store';
import { FormsModule } from '@angular/forms';
import { TodosComponent } from './todos/todos.component';
import { TodosDashboardComponent } from './todos-dashboard/todos-dashboard.component';


@NgModule({
  declarations: [
    AppComponent,
    TodosComponent,
    TodosDashboardComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    NgReduxModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
  constructor(ngRedux: NgRedux<IAppState>, devTool: DevToolsExtension) {
    var enhancers = isDevMode() ? [devTool.enhancer()] : [];
    ngRedux.configureStore(rootReducer as any, INITIAL_STATE, [], enhancers);
  }
 }
