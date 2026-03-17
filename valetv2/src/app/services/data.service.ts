import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';

import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ErrorHandlerService } from './error-handler.service';
import { PhoneUtilService } from './phone-util.service';

import * as firebase from 'firebase/app';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  constructor(private db: AngularFirestore, private errHandler: ErrorHandlerService, private phoneUtil: PhoneUtilService) {
  }

  getUser(ticketNo, token?) {
    return from(
      this.db.collection('tickets').ref
        .where('ticket_no', '==', ticketNo)
        .get() as Promise<any>
    ).pipe(
      map(snapshot => {
        if (snapshot.empty) {
          const err = { status: 404 };
          this.errHandler.handleError(err);
          throw err;
        }

        const ticket = snapshot.docs[0].data();

        return {
          first_name: ticket.first_name,
          last_name: ticket.last_name,
          car: {
            reg_no: ticket.reg_no,
            color: ticket.color,
            manufacturer: ticket.manufacturer,
            model: ticket.model,
          },
          ticket: {
            paid: ticket.paid,
            amount: ticket.amount,
            no: ticket.ticket_no,
          }
        };
      })
    );
  }

  updatePaymentStatus(ticketNo, token?) {
    return from(
      this.db.collection('tickets').ref
        .where('ticket_no', '==', ticketNo)
        .get() as Promise<any>
    ).pipe(
      switchMap(snapshot => {
        if (snapshot.empty) {
          const err = { status: 404 };
          this.errHandler.handleError(err);
          throw err;
        }

        const ticketDoc = snapshot.docs[0];
        return from(ticketDoc.ref.update({
          paid: true,
          status: 'paid',
          paid_at: firebase.firestore.FieldValue.serverTimestamp()
        }));
      }),
      map(() => ({ message: 'Payment status updated', paid: true }))
    );
  }

  getQrCode(ticketNo, token?) {
    return from(
      this.db.collection('tickets').ref
        .where('ticket_no', '==', ticketNo)
        .get() as Promise<any>
    ).pipe(
      map(snapshot => {
        if (snapshot.empty) {
          const err = { status: 404 };
          this.errHandler.handleError(err);
          throw err;
        }

        const ticket = snapshot.docs[0].data();

        return {
          ticket_no: ticket.ticket_no,
          reg_no: ticket.reg_no,
          amount: ticket.amount,
          status: ticket.paid ? 'Pago' : 'Pendente'
        };
      })
    );
  }

  createTicket(values, token?) {
    const counterRef = this.db.collection('counters').doc('tickets').ref;

    return from(counterRef.get() as Promise<any>).pipe(
      switchMap(counterDoc => {
        let ticketNumber = 1;
        if (counterDoc.exists) {
          ticketNumber = counterDoc.data().current + 1;
        }

        return from(counterRef.set({ current: ticketNumber })).pipe(
          map(() => ticketNumber)
        );
      }),
      switchMap(ticketNumber => {
        const ticketNo = 'TKT-' + String(ticketNumber).padStart(6, '0');

        const ticketData = {
          ticket_no: ticketNo,
          first_name: values.first_name,
          last_name: values.last_name,
          phone_no: this.phoneUtil.formatPhone(values.phone_no),
          reg_no: (values.reg_no || '').toUpperCase(),
          manufacturer: values.manufacturer || '',
          model: values.model || '',
          color: values.color || '',
          amount: 25.00,
          paid: false,
          status: 'active',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };

        return from(this.db.collection('tickets').add(ticketData)).pipe(
          map(() => ({ message: 'Ticket created', ticket_no: ticketNo }))
        );
      })
    );
  }
}
