import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, skip } from 'rxjs/operators';
import { Chart, registerables } from 'chart.js';
import * as L from 'leaflet';

import { AuthService, Usuario } from '../../services/auth';
import {
  ApiService,
  KPIs,
  MetricaCanal,
  CeldaMapaCalor,
  PuntoSentimientoTiempo,
  GeografiaResponse,
  MapaGeograficoResponse,
  CiudadMapaGeo,
  PuntoMapaCalorGeo,
  UsuarioEnRiesgo,
  ResumenSegmentoInteracciones,
  ResumenRiesgo,
  Interaccion
} from '../../services/api';
import { WebsocketService, WsMessage, WsMetricasSnapshot } from '../../services/websocket';
import { ThemeService } from '../../services/theme';

Chart.register(...registerables);

export type SeccionActiva = 'resumen' | 'interacciones' | 'comunidad' | 'mapa';

interface Toast {
  id: number;
  title: string;
  detail: string;
  kind: 'create' | 'update' | 'delete';
}

interface ActividadItem {
  hora: Date;
  accion: string;
  detalle: string;
  kind: 'create' | 'update' | 'delete';
}

const PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#14b8a6',
  '#ec4899'
];

const SECCIONES_VALIDAS: SeccionActiva[] = ['resumen', 'interacciones', 'comunidad', 'mapa'];

/**
 * Capa térmica HTML5 Canvas 2D para Leaflet (sin dependencia de WebGL ni Web Workers).
 */
class ThermalHeatmapLayer extends L.Layer {
  private canvas?: HTMLCanvasElement;
  private palette: Uint8ClampedArray;
  private puntos: PuntoMapaCalorGeo[] = [];
  private boundRedraw = () => this.redraw();

  constructor(puntos: PuntoMapaCalorGeo[]) {
    super();
    this.puntos = puntos;
    this.palette = this.buildPalette();
  }

  private buildPalette(): Uint8ClampedArray {
    const palCanvas = document.createElement('canvas');
    palCanvas.width = 256;
    palCanvas.height = 1;
    const ctx = palCanvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.12, '#0ea5e9');
    grad.addColorStop(0.35, '#6366f1');
    grad.addColorStop(0.6, '#10b981');
    grad.addColorStop(0.82, '#f59e0b');
    grad.addColorStop(1.0, '#f43f5e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
    return ctx.getImageData(0, 0, 256, 1).data;
  }

  override onAdd(map: L.Map): this {
    const pane = map.getPanes().overlayPane;
    const canvas = L.DomUtil.create('canvas', 'c360-heat-canvas') as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '250';
    pane.appendChild(canvas);
    this.canvas = canvas;

    map.on('moveend zoomend resize viewreset', this.boundRedraw);
    this.redraw();
    return this;
  }

  override onRemove(map: L.Map): this {
    map.off('moveend zoomend resize viewreset', this.boundRedraw);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = undefined;
    return this;
  }

  redraw(): void {
    const map = (this as any)._map as L.Map | undefined;
    if (!map || !this.canvas) return;

    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.canvas, topLeft);

    this.canvas.width = size.x;
    this.canvas.height = size.y;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, size.x, size.y);
    if (!this.puntos.length) return;

    const zoom = map.getZoom();
    const radius = Math.max(18, Math.min(44, Math.round(zoom * 4.5)));
    const alphaPerPoint = zoom >= 7 ? 0.34 : 0.2;

    // Pincel radial en escala de alfa
    const brush = document.createElement('canvas');
    brush.width = radius * 2;
    brush.height = radius * 2;
    const bctx = brush.getContext('2d')!;
    const rGrad = bctx.createRadialGradient(radius, radius, radius * 0.12, radius, radius, radius);
    rGrad.addColorStop(0, `rgba(0,0,0,${alphaPerPoint})`);
    rGrad.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = rGrad;
    bctx.fillRect(0, 0, radius * 2, radius * 2);

    for (const p of this.puntos) {
      const pt = map.latLngToContainerPoint([Number(p.lat), Number(p.lng)]);
      if (pt.x < -radius || pt.y < -radius || pt.x > size.x + radius || pt.y > size.y + radius) {
        continue;
      }
      ctx.drawImage(brush, pt.x - radius, pt.y - radius);
    }

    const img = ctx.getImageData(0, 0, size.x, size.y);
    const data = img.data;
    const pal = this.palette;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      const offset = a * 4;
      data[i] = pal[offset];
      data[i + 1] = pal[offset + 1];
      data[i + 2] = pal[offset + 2];
      data[i + 3] = Math.min(225, Math.round(a * 1.18));
    }
    ctx.putImageData(img, 0, 0);
  }
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canalChart') canalRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('sentChart') sentRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('geoChart') geoRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('geoMapContainer') geoMapRef?: ElementRef<HTMLDivElement>;

  user = signal<Usuario | null>(null);
  activeView = signal<SeccionActiva>('resumen');

  // Datos analíticos globales
  kpis = signal<KPIs | null>(null);
  canales = signal<MetricaCanal[]>([]);
  serie = signal<PuntoSentimientoTiempo[]>([]);
  geo = signal<GeografiaResponse | null>(null);
  mapaGeo = signal<MapaGeograficoResponse | null>(null);
  ciudadSeleccionada = signal<string>('');
  mostrarMarcadores = signal<boolean>(true);
  matriz = signal<CeldaMapaCalor[]>([]);
  riesgo = signal<UsuarioEnRiesgo[]>([]);

  // Explorador paginado y métricas dinámicas del módulo Interacciones
  interacciones = signal<Interaccion[]>([]);
  totalInteraccionesFiltro = signal(0);
  resumenSegmento = signal<ResumenSegmentoInteracciones>({
    total_interacciones: 0,
    sentimiento_promedio: 0,
    total_reacciones: 0,
    promedio_reacciones: 0
  });
  filtroCanal = signal('');
  filtroTema = signal('');
  filtroTipo = signal('');
  pageSize = 12;
  offset = signal(0);
  loadingTabla = signal(false);

  // Filtros dinámicos y paginación del módulo Comunidad y riesgo
  filtroRiesgoPlataforma = signal('');
  filtroRiesgoPrioridad = signal('');
  riesgoPageSize = 12;
  offsetRiesgo = signal(0);
  loadingRiesgo = signal(false);
  resumenRiesgo = signal<ResumenRiesgo>({
    total_filtrados: 0,
    sentimiento_promedio: 0,
    mensajes_promedio_30d: 0
  });

  // Estado reactivo y notificaciones
  actividad = signal<ActividadItem[]>([]);
  toasts = signal<Toast[]>([]);
  flashId = signal('');
  kpiFlash = signal(false);
  loading = signal(true);
  lastSync = signal<Date>(new Date());

  readonly catalogoCanales = ['Telegram', 'Discord', 'Twitter/X', 'Instagram', 'Facebook', 'TikTok'];
  readonly catalogoTipos = ['mensaje', 'comentario', 'reaccion', 'respuesta_encuesta', 'rsvp_evento'];
  readonly catalogoTemas = [
    'arte_comisiones',
    'eventos_convenciones',
    'videojuegos',
    'memes_humor',
    'fursuits',
    'musica',
    'reglas_moderacion',
    'seguridad_privacidad'
  ];

  temas = computed(() => [...new Set(this.matriz().map((m) => m.tema))].sort());
  canalesMatriz = computed(() => [...new Set(this.matriz().map((m) => m.canal))].sort());
  maxCelda = computed(() => Math.max(1, ...this.matriz().map((m) => m.total)));
  maxCiudad = computed(() =>
    Math.max(1, ...(this.geo()?.ciudades_top || []).map((c) => Number(c.total_usuarios)))
  );

  canalLider = computed(() => {
    const lista = this.canales();
    return lista.length ? lista[0] : null;
  });

  ciudadPrincipal = computed(() => {
    const lista = this.mapaGeo()?.ciudades || [];
    return lista.length ? lista[0] : null;
  });

  usuariosEstables = computed(() => {
    const k = this.kpis();
    if (!k) return 0;
    return Math.max(0, Number(k.total_usuarios) - Number(k.usuarios_en_riesgo));
  });

  pctSalud = computed(() => {
    const k = this.kpis();
    if (!k || !k.total_usuarios) return 0;
    return (this.usuariosEstables() / Number(k.total_usuarios)) * 100;
  });

  paginaActual = computed(() => Math.floor(this.offset() / this.pageSize) + 1);
  totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalInteraccionesFiltro() / this.pageSize))
  );

  paginaActualRiesgo = computed(
    () => Math.floor(this.offsetRiesgo() / this.riesgoPageSize) + 1
  );
  totalPaginasRiesgo = computed(() =>
    Math.max(1, Math.ceil(this.resumenRiesgo().total_filtrados / this.riesgoPageSize))
  );

  private charts: { canal?: Chart; sent?: Chart; geo?: Chart } = {};
  private geoMap?: L.Map;
  private tileLayer?: L.TileLayer;
  private markersGroup?: L.LayerGroup;
  private cityMarkers = new Map<string, L.CircleMarker>();
  private subs = new Subscription();
  private refresh$ = new Subject<void>();
  private toastSeq = 0;
  private viewReady = false;

  get wsConnected$() {
    return this.ws.connected$;
  }
  get theme$() {
    return this.themeService.theme$;
  }

  constructor(
    private auth: AuthService,
    private api: ApiService,
    private ws: WebsocketService,
    private themeService: ThemeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.user.set(this.auth.getUser());

    this.subs.add(
      this.route.paramMap.subscribe((params) => {
        const raw = (params.get('seccion') || 'resumen').toLowerCase() as SeccionActiva;
        const seccion: SeccionActiva = SECCIONES_VALIDAS.includes(raw) ? raw : 'resumen';
        if (raw !== seccion) {
          this.router.navigate(['/dashboard', seccion], { replaceUrl: true });
          return;
        }
        this.activeView.set(seccion);
        if (this.viewReady && !this.loading()) {
          setTimeout(() => this.renderVisualsForActiveView(), 30);
        }
      })
    );

    this.cargarTodo();
    this.ws.connect();

    this.subs.add(this.ws.messages$.subscribe((m) => this.onWs(m)));
    this.subs.add(
      this.refresh$.pipe(debounceTime(350)).subscribe(() => this.recargarAnaliticas())
    );
    this.subs.add(
      this.themeService.theme$.pipe(skip(1)).subscribe(() => {
        setTimeout(() => {
          if (this.activeView() === 'mapa') {
            this.actualizarTilesMapaTema();
          } else {
            this.renderVisualsForActiveView();
          }
        }, 0);
      })
    );
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (!this.loading()) {
      setTimeout(() => this.renderVisualsForActiveView(), 30);
    }
  }

  // ---------------- Navegación entre módulos exclusivos ----------------
  irASeccion(seccion: SeccionActiva): void {
    if (this.activeView() === seccion) return;
    this.router.navigate(['/dashboard', seccion]);
  }

  tituloSeccion(): string {
    switch (this.activeView()) {
      case 'interacciones':
        return 'Explorador de interacciones';
      case 'comunidad':
        return 'Comunidad y retención';
      case 'mapa':
        return 'Mapa de calor geográfico';
      default:
        return 'Resumen ejecutivo';
    }
  }

  subtituloSeccion(): string {
    switch (this.activeView()) {
      case 'interacciones':
        return 'Historial y flujo en vivo de conversaciones en canales sociales';
      case 'comunidad':
        return 'Salud de miembros, alertas tempranas de abandono y alcance demográfico';
      case 'mapa':
        return 'Concentración espacial de miembros con consentimiento de ubicación activo';
      default:
        return 'Indicadores globales de actividad, sentimiento y participación';
    }
  }

  // ---------------- Carga de datos ----------------
  private cargarTodo(): void {
    this.loading.set(true);
    const safe = <T>(obs: any, fallback: T) => obs.pipe(catchError(() => of(fallback)));

    forkJoin({
      kpis: safe(this.api.getKPIs(), null as KPIs | null),
      canales: safe(this.api.getPorCanal(), [] as MetricaCanal[]),
      serie: safe(this.api.getSentimientoTiempo(), [] as PuntoSentimientoTiempo[]),
      geo: safe(this.api.getGeografia(), null as GeografiaResponse | null),
      mapaGeo: safe(this.api.getMapaGeografico(), null as MapaGeograficoResponse | null),
      matriz: safe(this.api.getMapaCalor(), [] as CeldaMapaCalor[]),
      riesgoDet: safe(
        this.api.getUsuariosEnRiesgoDetalle({
          plataforma: this.filtroRiesgoPlataforma() || undefined,
          prioridad: this.filtroRiesgoPrioridad() || undefined,
          limit: this.riesgoPageSize,
          offset: this.offsetRiesgo()
        }),
        { usuarios: [] as UsuarioEnRiesgo[] }
      ),
      lista: safe(
        this.api.getInteracciones({
          limit: this.pageSize,
          offset: this.offset(),
          canal: this.filtroCanal() || undefined,
          tema: this.filtroTema() || undefined,
          tipo: this.filtroTipo() || undefined
        }),
        { total: 0, limit: this.pageSize, offset: 0, interacciones: [] }
      )
    }).subscribe((r: any) => {
      this.kpis.set(r.kpis);
      this.canales.set(r.canales);
      this.serie.set(r.serie);
      this.geo.set(r.geo);
      this.mapaGeo.set(r.mapaGeo);
      this.matriz.set(r.matriz);
      this.riesgo.set(r.riesgoDet?.usuarios || []);
      this.resumenRiesgo.set(
        r.riesgoDet?.resumen || {
          total_filtrados: (r.riesgoDet?.usuarios || []).length,
          sentimiento_promedio: 0,
          mensajes_promedio_30d: 0
        }
      );
      this.interacciones.set(r.lista?.interacciones || []);
      this.totalInteraccionesFiltro.set(r.lista?.total || 0);
      this.resumenSegmento.set(
        r.lista?.resumen_segmento || {
          total_interacciones: r.lista?.total || 0,
          sentimiento_promedio: r.kpis?.sentimiento_promedio || 0,
          total_reacciones: 0,
          promedio_reacciones: 0
        }
      );
      this.lastSync.set(new Date());
      this.loading.set(false);
      if (this.viewReady) {
        setTimeout(() => this.renderVisualsForActiveView(), 30);
      }
    });
  }

  cargarPaginaInteracciones(): void {
    this.loadingTabla.set(true);
    this.api
      .getInteracciones({
        limit: this.pageSize,
        offset: this.offset(),
        canal: this.filtroCanal() || undefined,
        tema: this.filtroTema() || undefined,
        tipo: this.filtroTipo() || undefined
      })
      .pipe(
        catchError(() =>
          of({
            total: 0,
            limit: this.pageSize,
            offset: 0,
            interacciones: [] as Interaccion[]
          } as any)
        )
      )
      .subscribe((res: any) => {
        this.interacciones.set(res.interacciones || []);
        this.totalInteraccionesFiltro.set(res.total || 0);
        if (res.resumen_segmento) {
          this.resumenSegmento.set(res.resumen_segmento);
        }
        this.loadingTabla.set(false);
      });
  }

  onFiltroCanal(valor: string): void {
    this.filtroCanal.set(valor);
    this.offset.set(0);
    this.cargarPaginaInteracciones();
  }

  onFiltroTema(valor: string): void {
    this.filtroTema.set(valor);
    this.offset.set(0);
    this.cargarPaginaInteracciones();
  }

  onFiltroTipo(valor: string): void {
    this.filtroTipo.set(valor);
    this.offset.set(0);
    this.cargarPaginaInteracciones();
  }

  limpiarFiltros(): void {
    if (!this.hayFiltrosInteracciones()) return;
    this.filtroCanal.set('');
    this.filtroTema.set('');
    this.filtroTipo.set('');
    this.offset.set(0);
    this.cargarPaginaInteracciones();
  }

  hayFiltrosInteracciones(): boolean {
    return Boolean(this.filtroCanal() || this.filtroTema() || this.filtroTipo());
  }

  sentSegmentoPct(): number {
    return ((Number(this.resumenSegmento().sentimiento_promedio || 0) + 1) / 2) * 100;
  }

  // ---- Filtros y paginación de Comunidad y riesgo ----
  cargarRiesgoFiltrado(): void {
    this.loadingRiesgo.set(true);
    this.api
      .getUsuariosEnRiesgoDetalle({
        plataforma: this.filtroRiesgoPlataforma() || undefined,
        prioridad: this.filtroRiesgoPrioridad() || undefined,
        limit: this.riesgoPageSize,
        offset: this.offsetRiesgo()
      })
      .pipe(catchError(() => of({ usuarios: [] as UsuarioEnRiesgo[] } as any)))
      .subscribe((res: any) => {
        this.riesgo.set(res.usuarios || []);
        if (res.resumen) {
          this.resumenRiesgo.set(res.resumen);
        }
        this.loadingRiesgo.set(false);
      });
  }

  onFiltroRiesgoPlataforma(valor: string): void {
    this.filtroRiesgoPlataforma.set(valor);
    this.offsetRiesgo.set(0);
    this.cargarRiesgoFiltrado();
  }

  onFiltroRiesgoPrioridad(valor: string): void {
    this.filtroRiesgoPrioridad.set(valor);
    this.offsetRiesgo.set(0);
    this.cargarRiesgoFiltrado();
  }

  limpiarFiltrosRiesgo(): void {
    if (!this.filtroRiesgoPlataforma() && !this.filtroRiesgoPrioridad()) return;
    this.filtroRiesgoPlataforma.set('');
    this.filtroRiesgoPrioridad.set('');
    this.offsetRiesgo.set(0);
    this.cargarRiesgoFiltrado();
  }

  paginaAnteriorRiesgo(): void {
    if (this.offsetRiesgo() <= 0) return;
    this.offsetRiesgo.update((o) => Math.max(0, o - this.riesgoPageSize));
    this.cargarRiesgoFiltrado();
  }

  paginaSiguienteRiesgo(): void {
    if (this.offsetRiesgo() + this.riesgoPageSize >= this.resumenRiesgo().total_filtrados) return;
    this.offsetRiesgo.update((o) => o + this.riesgoPageSize);
    this.cargarRiesgoFiltrado();
  }

  rangoMostradoRiesgo(): string {
    const total = this.resumenRiesgo().total_filtrados;
    if (!total) return '0 resultados';
    const ini = this.offsetRiesgo() + 1;
    const fin = Math.min(this.offsetRiesgo() + this.riesgo().length, total);
    return `${ini}–${fin} de ${total}`;
  }

  paginaAnterior(): void {
    if (this.offset() <= 0) return;
    this.offset.update((o) => Math.max(0, o - this.pageSize));
    this.cargarPaginaInteracciones();
  }

  paginaSiguiente(): void {
    if (this.offset() + this.pageSize >= this.totalInteraccionesFiltro()) return;
    this.offset.update((o) => o + this.pageSize);
    this.cargarPaginaInteracciones();
  }

  private recargarAnaliticas(): void {
    forkJoin({
      kpis: this.api.getKPIs().pipe(catchError(() => of(this.kpis()))),
      canales: this.api.getPorCanal().pipe(catchError(() => of(this.canales()))),
      serie: this.api.getSentimientoTiempo().pipe(catchError(() => of(this.serie()))),
      matriz: this.api.getMapaCalor().pipe(catchError(() => of(this.matriz())))
    }).subscribe((r) => {
      this.kpis.set(r.kpis);
      this.canales.set(r.canales);
      this.serie.set(r.serie);
      this.matriz.set(r.matriz);
      this.lastSync.set(new Date());
      this.cargarPaginaInteracciones();
      this.cargarRiesgoFiltrado();
      if (this.activeView() !== 'mapa') {
        setTimeout(() => this.renderVisualsForActiveView(), 0);
      }
    });
  }

  // ---------------- Sincronización en tiempo real ----------------
  private onWs(msg: WsMessage): void {
    const snap: WsMetricasSnapshot | undefined = msg.metricas || msg.data;
    if (snap && this.kpis()) {
      this.kpis.update((k) =>
        k
          ? {
              ...k,
              total_interacciones: snap.total_interacciones,
              sentimiento_promedio: snap.sentimiento_promedio,
              usuarios_en_riesgo: snap.usuarios_en_riesgo
            }
          : k
      );
    }

    switch (msg.tipo) {
      case 'INTERACCION_CREADA': {
        const it = msg.evento?.interaccion as Interaccion;
        if (!it) break;
        const coincideCanal = !this.filtroCanal() || it.canal === this.filtroCanal();
        const coincideTema = !this.filtroTema() || it.tema === this.filtroTema();
        const coincideTipo = !this.filtroTipo() || it.tipo === this.filtroTipo();
        if (coincideCanal && coincideTema && coincideTipo) {
          this.totalInteraccionesFiltro.update((n) => n + 1);
          if (this.offset() === 0) {
            this.interacciones.update((l) =>
              [it, ...l.filter((x) => x.id_interaccion !== it.id_interaccion)].slice(
                0,
                this.pageSize
              )
            );
          }
        }
        this.flash(it.id_interaccion);
        this.registrarActividad(
          'Nueva',
          `${it.canal} · ${this.tema(it.tema)} (${this.fmt(it.sentimiento)})`,
          'create'
        );
        break;
      }
      case 'INTERACCION_ACTUALIZADA': {
        const id = msg.evento?.id_interaccion || '';
        const cambios = msg.evento?.cambios || {};
        this.interacciones.update((l) =>
          l.map((x) => (x.id_interaccion === id ? { ...x, ...cambios } : x))
        );
        this.flash(id);
        this.registrarActividad(
          'Actualizada',
          `Registro ${id} actualizado en el flujo`,
          'update'
        );
        break;
      }
      case 'INTERACCION_ELIMINADA': {
        const id = msg.evento?.id_interaccion || '';
        const existia = this.interacciones().some((x) => x.id_interaccion === id);
        if (existia) {
          this.interacciones.update((l) => l.filter((x) => x.id_interaccion !== id));
          this.totalInteraccionesFiltro.update((n) => Math.max(0, n - 1));
        }
        this.registrarActividad('Removida', `Registro ${id} retirado del historial`, 'delete');
        break;
      }
    }

    if (msg.tipo.startsWith('INTERACCION_')) {
      this.kpiFlash.set(true);
      setTimeout(() => this.kpiFlash.set(false), 900);
      this.refresh$.next();
    }
  }

  private registrarActividad(
    accion: string,
    detalle: string,
    kind: ActividadItem['kind']
  ): void {
    this.actividad.update((e) => [{ hora: new Date(), accion, detalle, kind }, ...e].slice(0, 25));
    const titles = {
      create: 'Nueva interacción registrada',
      update: 'Interacción modificada',
      delete: 'Interacción eliminada'
    };
    const id = ++this.toastSeq;
    this.toasts.update((t) => [...t, { id, title: titles[kind], detail: detalle, kind }].slice(-4));
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 4500);
  }

  private flash(id: string): void {
    this.flashId.set(id);
    setTimeout(() => this.flashId.set(''), 2400);
  }

  dismissToast(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  // ---------------- Renderizado de Gráficas y Mapa Leaflet ----------------
  private themeColors() {
    const dark = this.themeService.current === 'dark';
    return {
      text: dark ? '#94a3b8' : '#475569',
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      tooltipBg: dark ? '#171c28' : '#ffffff',
      tooltipText: dark ? '#f1f5f9' : '#0f172a',
      border: dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
      surface: dark ? '#121620' : '#ffffff'
    };
  }

  private baseOptions(c: ReturnType<DashboardComponent['themeColors']>): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.tooltipBg,
          titleColor: c.tooltipText,
          bodyColor: c.text,
          borderColor: c.border,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' }
        }
      }
    };
  }

  private destruirMapaLeaflet(): void {
    this.cityMarkers.clear();
    if (this.geoMap) {
      this.geoMap.remove();
      this.geoMap = undefined;
    }
    this.tileLayer = undefined;
    this.markersGroup = undefined;
  }

  private renderVisualsForActiveView(): void {
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.font.size = 11;
    const c = this.themeColors();
    const vista = this.activeView();

    if (vista !== 'mapa') {
      this.destruirMapaLeaflet();
    }

    if (vista === 'resumen') {
      this.charts.geo?.destroy();
      this.charts.geo = undefined;
      this.renderResumenCharts(c);
    } else if (vista === 'comunidad') {
      this.charts.canal?.destroy();
      this.charts.sent?.destroy();
      this.charts.canal = undefined;
      this.charts.sent = undefined;
      this.renderComunidadChart(c);
    } else if (vista === 'mapa') {
      Object.values(this.charts).forEach((ch) => ch?.destroy());
      this.charts = {};
      this.inicializarMapaCalorLeaflet();
    } else {
      Object.values(this.charts).forEach((ch) => ch?.destroy());
      this.charts = {};
    }
  }

  private crearCapaTilesActual(): L.TileLayer {
    const cfg = this.mapaGeo()?.mapa_config;
    const isDark = this.themeService.current === 'dark';
    const fallback = isDark
      ? cfg?.fallback_dark || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : cfg?.fallback_light || 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const primaryUrl = isDark ? cfg?.tiles_dark || fallback : cfg?.tiles_light || fallback;
    const layer = L.tileLayer(primaryUrl, {
      attribution: cfg?.attribution || '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 18,
      subdomains: 'abcd'
    });

    // Si la API Key de MapTiler es inválida o falla la cuota, cambia automáticamente al mapa de respaldo
    let fallbackActivado = false;
    layer.on('tileerror', () => {
      if (!fallbackActivado && primaryUrl !== fallback) {
        fallbackActivado = true;
        layer.setUrl(fallback);
      }
    });

    return layer;
  }

  private inicializarMapaCalorLeaflet(): void {
    const container = this.geoMapRef?.nativeElement;
    if (!container) return;

    this.destruirMapaLeaflet();
    this.ciudadSeleccionada.set('');

    const map = L.map(container, {
      center: [21.5, -99.0],
      zoom: 4,
      minZoom: 2,
      maxZoom: 16,
      zoomControl: false,
      worldCopyJump: true
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    this.geoMap = map;

    this.tileLayer = this.crearCapaTilesActual().addTo(map);

    const datos = this.mapaGeo();
    if (datos) {
      // 1. Capa térmica Canvas 2D con las 793 ubicaciones consentidas
      const heatLayer = new ThermalHeatmapLayer(datos.puntos || []);
      heatLayer.addTo(map);

      // 2. Nodos interactivos por ciudad
      const group = L.layerGroup();
      for (const c of datos.ciudades || []) {
        const total = Number(c.total_usuarios || 1);
        const radio = Math.max(6, Math.min(16, 4 + Math.sqrt(total) * 0.95));
        const sent = Number(c.sentimiento_promedio || 0);
        const signo = sent > 0 ? `+${sent.toFixed(2)}` : sent.toFixed(2);

        const marker = L.circleMarker([Number(c.lat), Number(c.lng)], {
          radius: radio,
          color: '#ffffff',
          weight: 2,
          fillColor: '#6366f1',
          fillOpacity: 0.9
        });

        marker.bindPopup(`
          <div class="c360-map-popup">
            <strong>${c.ciudad}</strong>
            <span>${c.estado}, ${c.pais}</span>
            <div class="c360-map-popup__stats">
              <div><small>Miembros</small><b>${total}</b></div>
              <div><small>Sentimiento</small><b>${signo}</b></div>
            </div>
          </div>
        `);

        marker.on('click', () => this.ciudadSeleccionada.set(c.ciudad));
        group.addLayer(marker);
        this.cityMarkers.set(c.ciudad, marker);
      }

      this.markersGroup = group;
      if (this.mostrarMarcadores()) {
        group.addTo(map);
      }
    }

    // Garantizar dimensiones exactas tras la animación de entrada de la vista
    setTimeout(() => map.invalidateSize(), 120);
    setTimeout(() => map.invalidateSize(), 350);
  }

  private actualizarTilesMapaTema(): void {
    if (!this.geoMap) {
      this.inicializarMapaCalorLeaflet();
      return;
    }
    if (this.tileLayer) {
      this.geoMap.removeLayer(this.tileLayer);
    }
    this.tileLayer = this.crearCapaTilesActual().addTo(this.geoMap);
  }

  enfocarCiudad(c: CiudadMapaGeo): void {
    this.ciudadSeleccionada.set(c.ciudad);
    if (!this.geoMap) return;
    this.geoMap.flyTo([Number(c.lat), Number(c.lng)], 8, { duration: 1.1 });
    const marker = this.cityMarkers.get(c.ciudad);
    if (marker) {
      if (!this.mostrarMarcadores() && this.markersGroup) {
        this.mostrarMarcadores.set(true);
        this.markersGroup.addTo(this.geoMap);
      }
      setTimeout(() => marker.openPopup(), 450);
    }
  }

  vistaGlobalMapa(): void {
    this.ciudadSeleccionada.set('');
    this.geoMap?.closePopup();
    this.geoMap?.flyTo([12.0, -75.0], 3, { duration: 1.0 });
  }

  enfocarMexico(): void {
    this.ciudadSeleccionada.set('');
    this.geoMap?.closePopup();
    this.geoMap?.flyTo([22.5, -100.5], 5, { duration: 1.0 });
  }

  toggleMarcadoresMapa(): void {
    const nuevo = !this.mostrarMarcadores();
    this.mostrarMarcadores.set(nuevo);
    if (!this.geoMap || !this.markersGroup) return;
    if (nuevo) {
      this.markersGroup.addTo(this.geoMap);
    } else {
      this.geoMap.removeLayer(this.markersGroup);
    }
  }

  private renderResumenCharts(c: ReturnType<DashboardComponent['themeColors']>): void {
    if (this.canalRef?.nativeElement) {
      this.charts.canal?.destroy();
      const can = this.canales();
      this.charts.canal = new Chart(this.canalRef.nativeElement, {
        type: 'bar',
        data: {
          labels: can.map((x) => x.canal),
          datasets: [
            {
              label: 'Interacciones',
              data: can.map((x) => x.total_interacciones),
              backgroundColor: can.map((_, i) => PALETTE[i % PALETTE.length]),
              borderRadius: 6,
              barThickness: 18
            }
          ]
        },
        options: {
          ...this.baseOptions(c),
          indexAxis: 'y',
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: c.text, precision: 0 },
              grid: { color: c.grid },
              border: { display: false }
            },
            y: {
              ticks: { color: c.text },
              grid: { display: false },
              border: { display: false }
            }
          }
        }
      });
    }

    if (this.sentRef?.nativeElement) {
      this.charts.sent?.destroy();
      const s = this.serie();
      const ctx = this.sentRef.nativeElement.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 0, 260);
      grad.addColorStop(0, 'rgba(99,102,241,0.28)');
      grad.addColorStop(1, 'rgba(99,102,241,0)');

      this.charts.sent = new Chart(this.sentRef.nativeElement, {
        type: 'line',
        data: {
          labels: s.map((p) => p.fecha.slice(5)),
          datasets: [
            {
              label: 'Sentimiento medio',
              data: s.map((p) => p.sentimiento_medio),
              yAxisID: 'y',
              borderColor: '#6366f1',
              backgroundColor: grad,
              fill: true,
              tension: 0.35,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4
            },
            {
              type: 'bar',
              label: 'Volumen diario',
              data: s.map((p) => p.total_interacciones),
              yAxisID: 'y1',
              backgroundColor: 'rgba(14,165,233,0.25)',
              borderRadius: 3
            } as any
          ]
        },
        options: {
          ...this.baseOptions(c),
          interaction: { mode: 'index', intersect: false },
          plugins: {
            ...this.baseOptions(c).plugins,
            legend: {
              display: true,
              position: 'top',
              align: 'end',
              labels: { color: c.text, boxWidth: 10, boxHeight: 10, usePointStyle: true }
            }
          },
          scales: {
            x: {
              ticks: { color: c.text, maxTicksLimit: 10 },
              grid: { display: false },
              border: { display: false }
            },
            y: {
              min: -1,
              max: 1,
              ticks: { color: c.text, stepSize: 0.5 },
              grid: { color: c.grid },
              border: { display: false }
            },
            y1: {
              position: 'right',
              beginAtZero: true,
              ticks: { color: c.text, precision: 0 },
              grid: { display: false },
              border: { display: false }
            }
          }
        }
      });
    }
  }

  private renderComunidadChart(c: ReturnType<DashboardComponent['themeColors']>): void {
    if (!this.geoRef?.nativeElement) return;
    this.charts.geo?.destroy();
    const paises = (this.geo()?.paises || []).slice(0, 6);
    this.charts.geo = new Chart(this.geoRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: paises.map((p) => p.pais),
        datasets: [
          {
            data: paises.map((p) => p.total_usuarios),
            backgroundColor: paises.map((_, i) => PALETTE[i % PALETTE.length]),
            borderColor: c.surface,
            borderWidth: 3,
            hoverOffset: 6
          }
        ]
      },
      options: {
        ...this.baseOptions(c),
        cutout: '72%',
        plugins: {
          ...this.baseOptions(c).plugins,
          legend: {
            display: true,
            position: 'right',
            labels: {
              color: c.text,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              padding: 14
            }
          }
        }
      }
    });
  }

  // ---------------- Utilidades de formato ----------------
  celda(canal: string, tema: string): number {
    return this.matriz().find((m) => m.canal === canal && m.tema === tema)?.total || 0;
  }

  intensidad(canal: string, tema: string): number {
    const v = this.celda(canal, tema);
    return v === 0 ? 0 : 0.14 + (v / this.maxCelda()) * 0.86;
  }

  tema(t: string): string {
    return (t || '').replace(/_/g, ' ');
  }

  sentPill(v: number): string {
    if (v >= 0.25) return 'pill--emerald';
    if (v <= -0.25) return 'pill--rose';
    return 'pill--amber';
  }

  sentLabel(v: number): string {
    if (v >= 0.25) return 'Positivo';
    if (v <= -0.25) return 'Negativo';
    return 'Neutral';
  }

  prioridadRiesgo(sent: number): { label: string; clase: string } {
    if (Number(sent) <= -0.35) return { label: 'Prioridad alta', clase: 'pill--rose' };
    return { label: 'Seguimiento', clase: 'pill--amber' };
  }

  fmt(v: number | null | undefined): string {
    const n = Number(v || 0);
    return (n > 0 ? '+' : '') + n.toFixed(2);
  }

  pctRiesgo(): number {
    const k = this.kpis();
    return k && k.total_usuarios ? (k.usuarios_en_riesgo / k.total_usuarios) * 100 : 0;
  }

  sentPct(): number {
    return ((Number(this.kpis()?.sentimiento_promedio || 0) + 1) / 2) * 100;
  }

  totalConsentidos(): number {
    return (this.geo()?.paises || []).reduce((a, p) => a + Number(p.total_usuarios), 0);
  }

  pctCiudad(total: number): number {
    return (Number(total) / this.maxCiudad()) * 100;
  }

  initials(name?: string): string {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  rolLabel(rol?: string): string {
    if (rol === 'admin') return 'Administrador';
    if (rol === 'analista') return 'Analista';
    return rol || 'Usuario';
  }

  rangoMostrado(): string {
    const total = this.totalInteraccionesFiltro();
    if (!total) return '0 resultados';
    const ini = this.offset() + 1;
    const fin = Math.min(this.offset() + this.interacciones().length, total);
    return `${ini}–${fin} de ${total}`;
  }

  refrescar(): void {
    this.cargarTodo();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  logout(): void {
    this.ws.disconnect();
    this.auth.logout();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.ws.disconnect();
    this.destruirMapaLeaflet();
    Object.values(this.charts).forEach((ch) => ch?.destroy());
  }
}
