import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-payment',
    templateUrl: '../templates/payment.component.html',
    styleUrls: ['../../styles/components/payment.component.scss']
})

export class PaymentComponent implements OnInit, OnDestroy {

    @Input() amount: number = 0;
    @Input() ticketNo: string = '';

    selectedMethod: string = '';

    constructor(private router: Router) { }

    ngOnDestroy(): void {
    }
    ngOnInit(): void {
    }

    selectMethod(method: string) {
        this.selectedMethod = method;
        if (method === 'pix') {
            this.router.navigateByUrl(`/user/${this.ticketNo}/pix`);
        } else if (method === 'cartao') {
            this.router.navigateByUrl(`/user/${this.ticketNo}/card`);
        }
    }
}
