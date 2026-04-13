import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ErrorHandlerService } from './error-handler.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private errHandler: ErrorHandlerService
  ) {}

  private handleError(err: any) {
    const error = { status: err.status || 500 };
    this.errHandler.handleError(error);
    return throwError(error);
  }

  // Occupancy
  getOccupancy() {
    return this.http.get<any>(`${this.apiUrl}/occupancy`)
      .pipe(catchError(err => this.handleError(err)));
  }

  // Reports
  getReportsSummary(from?: string, to?: string) {
    let params: any = {};
    if (from) { params.from = from; }
    if (to) { params.to = to; }
    return this.http.get<any>(`${this.apiUrl}/reports/summary`, { params })
      .pipe(catchError(err => this.handleError(err)));
  }

  getReportsDaily(from?: string, to?: string) {
    let params: any = {};
    if (from) { params.from = from; }
    if (to) { params.to = to; }
    return this.http.get<any>(`${this.apiUrl}/reports/daily`, { params })
      .pipe(catchError(err => this.handleError(err)));
  }

  getAuditLogs(limit?: number) {
    let params: any = {};
    if (limit) { params.limit = limit.toString(); }
    return this.http.get<any>(`${this.apiUrl}/reports/audit`, { params })
      .pipe(catchError(err => this.handleError(err)));
  }

  // Valets
  getValets() {
    return this.http.get<any>(`${this.apiUrl}/valets`)
      .pipe(catchError(err => this.handleError(err)));
  }

  createValet(uname: string, pwd: string, role: string) {
    return this.http.post<any>(`${this.apiUrl}/valets`, { uname, pwd, role })
      .pipe(catchError(err => this.handleError(err)));
  }

  deleteValet(id: number) {
    return this.http.delete<any>(`${this.apiUrl}/valets/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  // Whitelist
  getWhitelist() {
    return this.http.get<any>(`${this.apiUrl}/whitelist`)
      .pipe(catchError(err => this.handleError(err)));
  }

  addWhitelist(reg_no: string, description: string) {
    return this.http.post<any>(`${this.apiUrl}/whitelist`, { reg_no, description })
      .pipe(catchError(err => this.handleError(err)));
  }

  removeWhitelist(id: number) {
    return this.http.delete<any>(`${this.apiUrl}/whitelist/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  // Blacklist
  getBlacklist() {
    return this.http.get<any>(`${this.apiUrl}/blacklist`)
      .pipe(catchError(err => this.handleError(err)));
  }

  addBlacklist(reg_no: string, description: string) {
    return this.http.post<any>(`${this.apiUrl}/blacklist`, { reg_no, description })
      .pipe(catchError(err => this.handleError(err)));
  }

  removeBlacklist(id: number) {
    return this.http.delete<any>(`${this.apiUrl}/blacklist/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  // Pricing
  getPricing() {
    return this.http.get<any>(`${this.apiUrl}/pricing`)
      .pipe(catchError(err => this.handleError(err)));
  }

  updatePricing(id: number, data: { price_per_hour?: number, max_daily?: number, tolerance_minutes?: number }) {
    return this.http.patch<any>(`${this.apiUrl}/pricing/${id}`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  // Alerts
  getAlertsConfig() {
    return this.http.get<any>(`${this.apiUrl}/alerts/config`)
      .pipe(catchError(err => this.handleError(err)));
  }

  updateAlertsConfig(data: { alerts_enabled?: boolean, alerts_webhook_url?: string, alerts_events?: string[] }) {
    return this.http.patch<any>(`${this.apiUrl}/alerts/config`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  // ── Totem Devices ──

  getTotemDevices() {
    return this.http.get<any>(`${this.apiUrl}/totem/devices`)
      .pipe(catchError(err => this.handleError(err)));
  }

  createTotemDevice(device_name: string, unit_id?: number) {
    const body: any = { device_name };
    if (unit_id) { body.unit_id = unit_id; }
    return this.http.post<any>(`${this.apiUrl}/totem/devices`, body)
      .pipe(catchError(err => this.handleError(err)));
  }

  updateTotemDevice(id: number, data: { is_active?: boolean, device_name?: string }) {
    return this.http.patch<any>(`${this.apiUrl}/totem/devices/${id}`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  deleteTotemDevice(id: number) {
    return this.http.delete<any>(`${this.apiUrl}/totem/devices/${id}`)
      .pipe(catchError(err => this.handleError(err)));
  }

  getTotemTransactions(params?: { limit?: number, device_id?: number, action?: string, from?: string, to?: string }) {
    let qp: any = {};
    if (params) {
      if (params.limit) { qp.limit = params.limit.toString(); }
      if (params.device_id) { qp.device_id = params.device_id.toString(); }
      if (params.action) { qp.action = params.action; }
      if (params.from) { qp.from = params.from; }
      if (params.to) { qp.to = params.to; }
    }
    return this.http.get<any>(`${this.apiUrl}/totem/transactions`, { params: qp })
      .pipe(catchError(err => this.handleError(err)));
  }

  // ── LPR Devices ──

  getLprDevices() {
    return this.http.get<any>(`${this.apiUrl}/lpr/devices`)
      .pipe(catchError(err => this.handleError(err)));
  }

  createLprDevice(data: { name: string, location?: string, ip_address?: string, unit_id?: number, type?: string }) {
    return this.http.post<any>(`${this.apiUrl}/lpr/devices`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  updateLprDevice(id: number, data: { is_active?: boolean, name?: string, location?: string, ip_address?: string }) {
    return this.http.patch<any>(`${this.apiUrl}/lpr/devices/${id}`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  getLprEvents(params?: { limit?: number, plate?: string, device_id?: number, event_type?: string }) {
    let qp: any = {};
    if (params) {
      if (params.limit) { qp.limit = params.limit.toString(); }
      if (params.plate) { qp.plate = params.plate; }
      if (params.device_id) { qp.device_id = params.device_id.toString(); }
      if (params.event_type) { qp.event_type = params.event_type; }
    }
    return this.http.get<any>(`${this.apiUrl}/api/v1/lpr/events`, { params: qp })
      .pipe(catchError(err => this.handleError(err)));
  }

  // ── Barrier Devices ──

  getBarrierDevices() {
    return this.http.get<any>(`${this.apiUrl}/barrier/devices`)
      .pipe(catchError(err => this.handleError(err)));
  }

  createBarrierDevice(data: { name: string, type?: string, control_url?: string, unit_id?: number }) {
    return this.http.post<any>(`${this.apiUrl}/barrier/devices`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  updateBarrierDevice(id: number, data: { is_active?: boolean, name?: string, control_url?: string }) {
    return this.http.patch<any>(`${this.apiUrl}/barrier/devices/${id}`, data)
      .pipe(catchError(err => this.handleError(err)));
  }

  openBarrier(id: number, ticket_no?: string) {
    const body: any = {};
    if (ticket_no) { body.ticket_no = ticket_no; }
    return this.http.post<any>(`${this.apiUrl}/api/v1/barrier/${id}/open`, body)
      .pipe(catchError(err => this.handleError(err)));
  }

  closeBarrier(id: number) {
    return this.http.post<any>(`${this.apiUrl}/api/v1/barrier/${id}/close`, {})
      .pipe(catchError(err => this.handleError(err)));
  }

  getBarrierEvents(params?: { limit?: number, barrier_id?: number }) {
    let qp: any = {};
    if (params) {
      if (params.limit) { qp.limit = params.limit.toString(); }
      if (params.barrier_id) { qp.barrier_id = params.barrier_id.toString(); }
    }
    return this.http.get<any>(`${this.apiUrl}/barrier/events`, { params: qp })
      .pipe(catchError(err => this.handleError(err)));
  }
}
