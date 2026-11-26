import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private renderer: Renderer2;
  private readonly STORAGE_KEY = 'c360_theme';

  theme$ = new BehaviorSubject<Theme>('dark');

  constructor(factory: RendererFactory2) {
    this.renderer = factory.createRenderer(null, null);
    const saved = (localStorage.getItem(this.STORAGE_KEY) as Theme) || 'dark';
    this.apply(saved);
  }

  get current(): Theme { return this.theme$.value; }

  toggle(): void {
    this.apply(this.current === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.renderer.setAttribute(document.documentElement, 'data-theme', theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
    this.theme$.next(theme);
  }
}
