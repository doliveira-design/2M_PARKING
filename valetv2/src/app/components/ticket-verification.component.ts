import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { DataService } from '../services/data.service';
import { TokenUtilService } from '../services/token-util.service';

import { switchMap } from 'rxjs/operators';

@Component({
    selector: 'app-qr',
    templateUrl: '../templates/ticket-verification.component.html',
    styleUrls: ['../../styles/components/ticket-verification.component.scss']
})

export class TicketVerificationComponent implements OnInit, OnDestroy {

    qrcode: String = null;

    constructor(private data: DataService,
        private tokenUtil: TokenUtilService,
        private route: ActivatedRoute) {
    }

    ngOnDestroy(): void { }
    ngOnInit(): void {
        this.tokenUtil.isTokenValid()
            .subscribe(() => {
                this.getQrCode();
            });
    }

    getQrCode() {
        let ticket_no = null;
        this.route.params
            .pipe(
                switchMap(param => {
                    ticket_no = param.ticket_no;
                    return this.data.getQrCode(ticket_no, this.tokenUtil.getToken());
                })
            )
            .subscribe((response: any) => {
                this.qrcode =
                   `Ticket No: ${response.ticket_no}  \n
                    Reg No: ${response.reg_no}  \n
                    Amount: ${response.amount}  \n
                    Status: ${response.status}  `;
            });
    }

}
