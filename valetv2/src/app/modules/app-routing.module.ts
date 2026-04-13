import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { UserLoginComponent } from '../components/user-login.component';
import { ValetLoginComponent } from '../components/valet-login.component';
import { TicketViewComponent } from '../components/ticket-view.component';
import { TicketCreationComponent } from '../components/ticket-creation.component';
import { TicketVerificationComponent } from '../components/ticket-verification.component';
import { InvalidRouteComponent } from '../components/invalid-route.component';
import { UnauthorizedComponent } from '../components/unauthorized.component';
import { AdminDashboardComponent } from '../components/admin-dashboard.component';
import { AdminValetsComponent } from '../components/admin-valets.component';
import { AdminListsComponent } from '../components/admin-lists.component';
import { AdminPricingComponent } from '../components/admin-pricing.component';
import { AdminReportsComponent } from '../components/admin-reports.component';
import { AdminAlertsComponent } from '../components/admin-alerts.component';
import { AdminTotemsComponent } from '../components/admin-totems.component';
import { AdminLprComponent } from '../components/admin-lpr.component';
import { AdminBarriersComponent } from '../components/admin-barriers.component';
import { PixPaymentComponent } from '../components/pix-payment.component';
import { CardPaymentComponent } from '../components/card-payment.component';

import { ValetGuard, AdminGuard, UserGuard } from '../services/auth-guard.service';

const routes: Routes = [
  { path: '', redirectTo: 'valet/login', pathMatch: 'full' },
  { path: 'valet/login', component: ValetLoginComponent },
  { path: 'valet/ticket', component: TicketCreationComponent, canActivate: [ValetGuard] },
  { path: 'valet/verificar', component: TicketVerificationComponent, canActivate: [ValetGuard] },
  { path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [AdminGuard] },
  { path: 'admin/valets', component: AdminValetsComponent, canActivate: [AdminGuard] },
  { path: 'admin/listas', component: AdminListsComponent, canActivate: [AdminGuard] },
  { path: 'admin/tarifacao', component: AdminPricingComponent, canActivate: [AdminGuard] },
  { path: 'admin/relatorios', component: AdminReportsComponent, canActivate: [AdminGuard] },
  { path: 'admin/alertas', component: AdminAlertsComponent, canActivate: [AdminGuard] },
  { path: 'admin/totems', component: AdminTotemsComponent, canActivate: [AdminGuard] },
  { path: 'admin/lpr', component: AdminLprComponent, canActivate: [AdminGuard] },
  { path: 'admin/cancelas', component: AdminBarriersComponent, canActivate: [AdminGuard] },
  { path: 'user/:ticket_no/login', component: UserLoginComponent },
  { path: 'user/:ticket_no/pix', component: PixPaymentComponent, canActivate: [UserGuard] },
  { path: 'user/:ticket_no/card', component: CardPaymentComponent, canActivate: [UserGuard] },
  { path: 'user/:ticket_no', component: TicketViewComponent, canActivate: [UserGuard] },
  { path: 'validate/:ticket_no', component: TicketVerificationComponent, canActivate: [ValetGuard] },
  { path: 'unauthorized', component: UnauthorizedComponent },
  { path: '**', component: InvalidRouteComponent },
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule { }
