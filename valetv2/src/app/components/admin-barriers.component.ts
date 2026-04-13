import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-barriers',
    templateUrl: '../templates/admin-barriers.component.html',
    styleUrls: ['../../styles/components/admin-barriers.component.scss']
})
export class AdminBarriersComponent implements OnInit, OnDestroy {

    devices: any[] = [];
    events: any[] = [];
    showForm = false;
    newDevice = { name: '', type: 'entry', control_url: '' };

    // Filters
    filterBarrierId: string = '';

    activeTab: 'devices' | 'events' = 'devices';
    private subs: Subscription[] = [];

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private router: Router,
        private spinner: NgxSpinnerService
    ) {}

    ngOnInit(): void {
        if (!this.tokenUtil.checkTokenExists('token_v')) {
            this.router.navigateByUrl('/valet/login');
            return;
        }
        this.loadDevices();
    }

    switchTab(tab: 'devices' | 'events') {
        this.activeTab = tab;
        if (tab === 'devices') { this.loadDevices(); }
        else { this.loadEvents(); }
    }

    loadDevices() {
        this.spinner.show();
        this.subs.push(this.admin.getBarrierDevices().subscribe(
            (data) => { this.devices = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        ));
    }

    loadEvents() {
        this.spinner.show();
        const params: any = {};
        if (this.filterBarrierId) { params.barrier_id = parseInt(this.filterBarrierId, 10); }
        this.subs.push(this.admin.getBarrierEvents(params).subscribe(
            (data) => { this.events = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        ));
    }

    toggleForm() {
        this.showForm = !this.showForm;
        if (!this.showForm) { this.newDevice = { name: '', type: 'entry', control_url: '' }; }
    }

    createDevice() {
        if (!this.newDevice.name) {
            this.notifier.addMessage('error', 'Erro', 'Informe o nome da cancela.');
            return;
        }
        this.spinner.show();
        this.subs.push(this.admin.createBarrierDevice(this.newDevice).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', `Cancela '${this.newDevice.name}' registrada.`);
                this.newDevice = { name: '', type: 'entry', control_url: '' };
                this.showForm = false;
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    toggleActive(device: any) {
        this.spinner.show();
        this.subs.push(this.admin.updateBarrierDevice(device.id, { is_active: !device.is_active }).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', `Cancela ${!device.is_active ? 'ativada' : 'desativada'}.`);
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    openBarrier(device: any) {
        this.spinner.show();
        this.subs.push(this.admin.openBarrier(device.id).subscribe(
            (res) => {
                const msg = res && res.simulated ? 'Cancela aberta (simulado).' : 'Cancela aberta.';
                this.notifier.addMessage('success', 'Sucesso', msg);
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    closeBarrier(device: any) {
        this.spinner.show();
        this.subs.push(this.admin.closeBarrier(device.id).subscribe(
            (res) => {
                const msg = res && res.simulated ? 'Cancela fechada (simulado).' : 'Cancela fechada.';
                this.notifier.addMessage('success', 'Sucesso', msg);
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    getStatusClass(device: any): string {
        if (!device.is_active) { return 'status-off'; }
        switch (device.status) {
            case 'online': return 'status-online';
            case 'error': return 'status-error';
            case 'stuck': return 'status-error';
            default: return 'status-offline';
        }
    }

    getStatusLabel(device: any): string {
        if (!device.is_active) { return 'Desativado'; }
        switch (device.status) {
            case 'online': return 'Online';
            case 'error': return 'Erro';
            case 'stuck': return 'Travada';
            default: return 'Offline';
        }
    }

    getTypeBadgeClass(type: string): string {
        return type === 'entry' ? 'badge-entry' : 'badge-exit';
    }

    getActionBadgeClass(action: string): string {
        if (action === 'open') { return 'badge-success'; }
        if (action === 'close') { return 'badge-info'; }
        if (action === 'error' || action === 'stuck') { return 'badge-danger'; }
        return 'badge-info';
    }

    getTriggerLabel(triggered_by: string): string {
        switch (triggered_by) {
            case 'lpr': return 'LPR (Auto)';
            case 'manual': return 'Manual';
            case 'automatic': return 'Automático';
            case 'system': return 'Sistema';
            default: return triggered_by;
        }
    }

    logout() {
        this.tokenUtil.logout();
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }
}
