import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { UserLoginComponent } from '../components/user-login.component';
import { ValetLoginComponent } from '../components/valet-login.component';
import { TicketViewComponent } from '../components/ticket-view.component';
import { TicketCreationComponent } from '../components/ticket-creation.component';
import { TicketVerificationComponent } from '../components/ticket-verification.component';
import { InvalidRouteComponent } from '../components/invalid-route.component';
import { UnauthorizedComponent } from '../components/unauthorized.component';

const routes: Routes = [
  { path: 'valet/login', component: ValetLoginComponent },
  { path: 'valet/ticket', component: TicketCreationComponent },
  { path: 'user/:ticket_no/login', component: UserLoginComponent },
  { path: 'user/:ticket_no', component: TicketViewComponent },
  { path: 'validate/:ticket_no', component: TicketVerificationComponent },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: '**', component: InvalidRouteComponent },
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule { }
