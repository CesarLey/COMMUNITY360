import { Injectable, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WsMetricasSnapshot {
  total_interacciones: number;
  sentimiento_promedio: number;
  usuarios_en_riesgo: number;
  por_canal: Array<{ canal: string; total: number }>;
}

export interface WsMessage {
  tipo:
    | 'CONEXION_ESTABLECIDA'
    | 'METRICAS_INICIALES'
    | 'INTERACCION_CREADA'
    | 'INTERACCION_ACTUALIZADA'
    | 'INTERACCION_ELIMINADA'
    | 'PONG'
    | string;
  timestamp?: string;
  mensaje?: string;
  data?: WsMetricasSnapshot;
  evento?: {
    operacion?: 'POST' | 'PUT' | 'DELETE';
    interaccion?: any;
    id_interaccion?: string;
    cambios?: any;
  };
  metricas?: WsMetricasSnapshot;
}

@Injectable({ providedIn: 'root' })
export class WebsocketService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: any;
  private pingInterval: any;
  private retryCount = 0;
  private shouldReconnect = true;

  readonly messages$ = new Subject<WsMessage>();
  readonly connected$ = new BehaviorSubject<boolean>(false);

  private resolveWsUrl(): string {
    if (environment.wsUrl) return environment.wsUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  connect(): void {
    this.shouldReconnect = true;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.ws = new WebSocket(this.resolveWsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected$.next(true);
      this.retryCount = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = ({ data }) => {
      try {
        const msg: WsMessage = JSON.parse(data);
        this.messages$.next(msg);
      } catch {
        // Ignore malformed JSON frames
      }
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
      this.stopHeartbeat();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ tipo: 'PING' }));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.8, this.retryCount), 15000);
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected$.next(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
