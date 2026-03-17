import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppRoutingModule } from './app-routing.module';
import { QRCodeModule } from 'angularx-qrcode';
import { NgxSpinnerModule } from 'ngx-spinner';
import { AngularFireModule } from '@angular/fire';
import { AngularFirestoreModule } from '@angular/fire/firestore';
import { AngularFireStorageModule } from '@angular/fire/storage';
import { environment } from '../../environments/environment';

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

import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';
import { ErrorHandlerService } from '../services/error-handler.service';
import { NotifierService } from '../services/notifier.service';
import { PhoneUtilService } from '../services/phone-util.service';
import { PlateUtilService } from '../services/plate-util.service';

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
    UnauthorizedComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    QRCodeModule,
    NgxSpinnerModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule,
    AngularFireStorageModule
  ],
  providers: [
    AuthService,
    DataService,
    ErrorHandlerService,
    NotifierService,
    PhoneUtilService,
    PlateUtilService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
