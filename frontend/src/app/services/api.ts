import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

export interface Interaccion {
  id_interaccion: string;
  id_usuario: string;
  alias?: string;
  timestamp: string;
  canal: string;
  tipo: string;
  texto: string | null;
  tema: string;
  sentimiento: number;
  idioma?: string | null;
  dispositivo?: string | null;
  longitud_texto?: number;
  reacciones_recibidas?: number;
  etiquetas: string[];
}

export interface ResumenSegmentoInteracciones {
  total_interacciones: number;
  sentimiento_promedio: number;
  total_reacciones: number;
  promedio_reacciones: number;
}

export interface ListaInteraccionesResponse {
  total: number;
  limit: number;
  offset: number;
  resumen_segmento?: ResumenSegmentoInteracciones;
  interacciones: Interaccion[];
}

export interface KPIs {
  total_usuarios: number;
  usuarios_en_riesgo: number;
  total_interacciones: number;
  sentimiento_promedio: number;
}

export interface MetricaCanal {
  canal: string;
  total_interacciones: number;
  sentimiento_medio: number;
}

export interface CeldaMapaCalor {
  canal: string;
  tema: string;
  total: number;
}

export interface PuntoSentimientoTiempo {
  fecha: string;
  total_interacciones: number;
  sentimiento_medio: number;
}

export interface PaisGeografia {
  pais: string;
  total_usuarios: number;
}

export interface CiudadGeografia {
  ciudad: string;
  estado: string;
  pais: string;
  total_usuarios: number;
}

export interface GeografiaResponse {
  privacidad_garantizada: boolean;
  paises: PaisGeografia[];
  ciudades_top: CiudadGeografia[];
}

export interface PuntoMapaCalorGeo {
  lat: number;
  lng: number;
  sentimiento: number;
}

export interface CiudadMapaGeo {
  ciudad: string;
  estado: string;
  pais: string;
  lat: number;
  lng: number;
  total_usuarios: number;
  sentimiento_promedio: number;
}

export interface MapaGeograficoResponse {
  privacidad_garantizada: boolean;
  mapa_config: {
    proveedor: string;
    api_key_activa: boolean;
    tiles_dark: string;
    tiles_light: string;
    fallback_dark: string;
    fallback_light: string;
    attribution: string;
  };
  puntos: PuntoMapaCalorGeo[];
  ciudades: CiudadMapaGeo[];
}

export interface UsuarioEnRiesgo {
  id_usuario: string;
  alias: string;
  plataforma_principal: string;
  mensajes_30d: number;
  reacciones_30d: number;
  sentimiento_promedio: number;
  ultima_actividad: string;
  estatus: string;
}

export interface ResumenRiesgo {
  total_filtrados: number;
  sentimiento_promedio: number;
  mensajes_promedio_30d: number;
}

export interface UsuariosEnRiesgoResponse {
  resumen?: ResumenRiesgo;
  usuarios: UsuarioEnRiesgo[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}

  private options(params?: HttpParams) {
    return {
      headers: this.auth.authHeaders(),
      withCredentials: true,
      ...(params ? { params } : {})
    };
  }

  private url(path: string): string {
    return `${environment.apiUrl}${path}`;
  }

  private handleError = (err: any) => {
    if (err?.status === 401) {
      this.auth.logout();
      this.router.navigate(['/login']);
    }
    return throwError(() => err);
  };

  getInteracciones(
    filtros: { limit?: number; offset?: number; canal?: string; tema?: string; tipo?: string } = {}
  ): Observable<ListaInteraccionesResponse> {
    let p = new HttpParams();
    if (filtros.limit !== undefined) p = p.set('limit', String(filtros.limit));
    if (filtros.offset !== undefined) p = p.set('offset', String(filtros.offset));
    if (filtros.canal) p = p.set('canal', filtros.canal);
    if (filtros.tema) p = p.set('tema', filtros.tema);
    if (filtros.tipo) p = p.set('tipo', filtros.tipo);

    return this.http
      .get<ListaInteraccionesResponse>(this.url('/api/interacciones'), this.options(p))
      .pipe(catchError(this.handleError));
  }

  getKPIs(): Observable<KPIs> {
    return this.http
      .get<{ kpis: KPIs }>(this.url('/api/metricas/kpis'), this.options())
      .pipe(
        map((r) => r.kpis),
        catchError(this.handleError)
      );
  }

  getPorCanal(): Observable<MetricaCanal[]> {
    return this.http
      .get<{ canales: MetricaCanal[] }>(this.url('/api/metricas/por-canal'), this.options())
      .pipe(
        map((r) => r.canales || []),
        catchError(this.handleError)
      );
  }

  getMapaCalor(): Observable<CeldaMapaCalor[]> {
    return this.http
      .get<{ matriz: CeldaMapaCalor[] }>(this.url('/api/metricas/mapa-calor'), this.options())
      .pipe(
        map((r) => r.matriz || []),
        catchError(this.handleError)
      );
  }

  getSentimientoTiempo(): Observable<PuntoSentimientoTiempo[]> {
    return this.http
      .get<{ serie_temporal: PuntoSentimientoTiempo[] }>(
        this.url('/api/metricas/sentimiento-tiempo'),
        this.options()
      )
      .pipe(
        map((r) => r.serie_temporal || []),
        catchError(this.handleError)
      );
  }

  getGeografia(): Observable<GeografiaResponse> {
    return this.http
      .get<GeografiaResponse>(this.url('/api/metricas/geografia'), this.options())
      .pipe(catchError(this.handleError));
  }

  getMapaGeografico(): Observable<MapaGeograficoResponse> {
    return this.http
      .get<MapaGeograficoResponse>(this.url('/api/metricas/mapa-geografico'), this.options())
      .pipe(catchError(this.handleError));
  }

  getUsuariosEnRiesgo(): Observable<UsuarioEnRiesgo[]> {
    return this.http
      .get<{ usuarios: UsuarioEnRiesgo[] }>(
        this.url('/api/metricas/usuarios-en-riesgo'),
        this.options()
      )
      .pipe(
        map((r) => r.usuarios || []),
        catchError(this.handleError)
      );
  }

  getUsuariosEnRiesgoDetalle(
    filtros: { plataforma?: string; prioridad?: string; limit?: number; offset?: number } = {}
  ): Observable<UsuariosEnRiesgoResponse> {
    let p = new HttpParams();
    if (filtros.plataforma) p = p.set('plataforma', filtros.plataforma);
    if (filtros.prioridad) p = p.set('prioridad', filtros.prioridad);
    if (filtros.limit !== undefined) p = p.set('limit', String(filtros.limit));
    if (filtros.offset !== undefined) p = p.set('offset', String(filtros.offset));

    return this.http
      .get<UsuariosEnRiesgoResponse>(this.url('/api/metricas/usuarios-en-riesgo'), this.options(p))
      .pipe(catchError(this.handleError));
  }
}
