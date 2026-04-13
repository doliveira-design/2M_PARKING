import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { QRCodeModule } from 'angularx-qrcode';
import { NgxSpinnerModule } from 'ngx-spinner';

import { AppComponent } from '../components/app.component';
import { ValetLoginComponent } from '../components/valet-login.component';
import { UserLoginComponent } from '../components/user-login.component';
import { PaymentComponent } from '../components/payment.component';
import { TicketCreationComponent } from '../components/ticket-creation.component';
import { TicketVerificationComponent } from '../components/ticket-verification.component';
import { TicketViewComponent } from '../components/ticket-view.component';
import { NotifierComponent } from '../components/notifier.component';
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

import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';
import { ErrorHandlerService } from '../services/error-handler.service';
import { NotifierService } from '../services/notifier.service';
import { PhoneUtilService } from '../services/phone-util.service';
import { PlateUtilService } from '../services/plate-util.service';
import { AdminService } from '../services/admin.service';
import { AuthInterceptor } from '../services/auth-interceptor.service';

@NgModule({
  declarations: [
    AppComponent,
    ValetLoginComponent,
    UserLoginComponent,
    PaymentComponent,
    TicketCreationComponent,
    TicketVerificationComponent,
    TicketViewComponent,
    NotifierComponent,
    InvalidRouteComponent,
    UnauthorizedComponent,
    AdminDashboardComponent,
    AdminValetsComponent,
    AdminListsComponent,
    AdminPricingComponent,
    AdminReportsComponent,
    AdminAlertsComponent,
    AdminTotemsComponent,
    AdminLprComponent,
    AdminBarriersComponent,
    PixPaymentComponent,
    CardPaymentComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule,
    QRCodeModule,
    NgxSpinnerModule
  ],
  providers: [
    AuthService,
    DataService,
    ErrorHandlerService,
    NotifierService,
    PhoneUtilService,
    PlateUtilService,
    AdminService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
