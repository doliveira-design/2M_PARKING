import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AdminService } from '../services/admin.service';
import { TokenUtilService } from '../services/token-util.service';
import { NotifierService } from '../services/notifier.service';
import { PlateUtilService } from '../services/plate-util.service';
import { NgxSpinnerService } from 'ngx-spinner';

@Component({
    selector: 'app-admin-lpr',
    templateUrl: '../templates/admin-lpr.component.html',
    styleUrls: ['../../styles/components/admin-lpr.component.scss']
})
export class AdminLprComponent implements OnInit, OnDestroy {

    devices: any[] = [];
    events: any[] = [];
    showForm = false;
    newDevice = { name: '', location: '', ip_address: '', type: 'entry' };
    createdKey: string | null = null;

    // Filters
    filterPlate: string = '';
    filterDeviceId: string = '';
    filterEventType: string = '';

    activeTab: 'devices' | 'events' = 'devices';
    private subs: Subscription[] = [];

    constructor(
        private admin: AdminService,
        private tokenUtil: TokenUtilService,
        private notifier: NotifierService,
        private plateUtil: PlateUtilService,
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
        this.subs.push(this.admin.getLprDevices().subscribe(
            (data) => { this.devices = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        ));
    }

    loadEvents() {
        this.spinner.show();
        const params: any = {};
        if (this.filterPlate) { params.plate = this.filterPlate; }
        if (this.filterDeviceId) { params.device_id = parseInt(this.filterDeviceId, 10); }
        if (this.filterEventType) { params.event_type = this.filterEventType; }
        this.subs.push(this.admin.getLprEvents(params).subscribe(
            (data) => { this.events = data; this.spinner.hide(); },
            () => { this.spinner.hide(); }
        ));
    }

    toggleForm() {
        this.showForm = !this.showForm;
        this.createdKey = null;
        if (!this.showForm) { this.newDevice = { name: '', location: '', ip_address: '', type: 'entry' }; }
    }

    createDevice() {
        if (!this.newDevice.name) {
            this.notifier.addMessage('error', 'Erro', 'Informe o nome da câmera.');
            return;
        }
        this.spinner.show();
        this.subs.push(this.admin.createLprDevice(this.newDevice).subscribe(
            (res) => {
                if (res && res.api_key) { this.createdKey = res.api_key; }
                this.notifier.addMessage('success', 'Sucesso', `Câmera '${this.newDevice.name}' registrada.`);
                this.newDevice = { name: '', location: '', ip_address: '', type: 'entry' };
                this.showForm = false;
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    toggleActive(device: any) {
        this.spinner.show();
        this.subs.push(this.admin.updateLprDevice(device.id, { is_active: !device.is_active }).subscribe(
            () => {
                this.notifier.addMessage('success', 'Sucesso', `Câmera ${!device.is_active ? 'ativada' : 'desativada'}.`);
                this.loadDevices();
            },
            () => { this.spinner.hide(); }
        ));
    }

    formatPlate(plate: string): string {
        return this.plateUtil.formatPlate(plate);
    }

    onPlateFilter(event: any) {
        this.filterPlate = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    getStatusClass(device: any): string {
        if (!device.is_active) { return 'status-off'; }
        if (!device.last_heartbeat) { return 'status-unknown'; }
        const diff = Date.now() - new Date(device.last_heartbeat).getTime();
        return diff < 300000 ? 'status-online' : 'status-offline';
    }

    getStatusLabel(device: any): string {
        if (!device.is_active) { return 'Desativado'; }
        if (!device.last_heartbeat) { return 'Sem contato'; }
        const diff = Date.now() - new Date(device.last_heartbeat).getTime();
        return diff < 300000 ? 'Online' : 'Offline';
    }

    getTypeBadgeClass(type: string): string {
        return type === 'entry' ? 'badge-entry' : 'badge-exit';
    }

    getActionBadgeClass(action: string): string {
        if (action.includes('whitelist') || action.includes('paid')) { return 'badge-success'; }
        if (action.includes('denied') || action.includes('blacklist')) { return 'badge-danger'; }
        return 'badge-info';
    }

    logout() {
        this.tokenUtil.logout();
    }

    ngOnDestroy(): void {
        this.subs.forEach(s => s.unsubscribe());
    }
}
