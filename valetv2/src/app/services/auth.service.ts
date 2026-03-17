import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

import { from, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ErrorHandlerService } from '../services/error-handler.service';
import { PhoneUtilService } from '../services/phone-util.service';
import { Md5 } from 'ts-md5/dist/md5';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private db: AngularFirestore, private errHandler: ErrorHandlerService, private phoneUtil: PhoneUtilService) {
  }

  loginUser(ticket_no, phone, reg_no) {
    return from(
      this.db.collection('tickets').ref
        .where('ticket_no', '==', ticket_no)
        .get() as Promise<any>
    ).pipe(
      switchMap(snapshot => {
        if (snapshot.empty) {
          const err = { status: 404 };
          this.errHandler.authError(err);
          return throwError(err);
        }

        const ticket = snapshot.docs[0].data();

        if (!this.phoneUtil.phonesMatch(ticket.phone_no, phone) || ticket.reg_no !== reg_no.toUpperCase()) {
          const err = { status: 401 };
          this.errHandler.authError(err);
          return throwError(err);
        }

        const token = 'user_' + ticket_no + '_' + Date.now();
        return from([{ auth: true, token }]);
      })
    );
  }

  loginValet(uname, pwd) {
    const hashedPwd = Md5.hashStr(pwd);

    return from(
      this.db.collection('valets').ref
        .where('uname', '==', uname)
        .get() as Promise<any>
    ).pipe(
      switchMap(snapshot => {
        if (snapshot.empty) {
          const err = { status: 401 };
          this.errHandler.authError(err);
          return throwError(err);
        }

        const valet = snapshot.docs[0].data();

        if (valet.pwd !== hashedPwd) {
          const err = { status: 401 };
          this.errHandler.authError(err);
          return throwError(err);
        }

        const token = 'valet_' + uname + '_' + Date.now();
        return from([{ auth: true, token }]);
      })
    );
  }

}
