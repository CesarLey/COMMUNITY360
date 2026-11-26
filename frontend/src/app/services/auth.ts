import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export interface Usuario {
  id: number;
  username: string;
  email: string;
  rol: string;
}

export interface LoginResponse {
  mensaje: string;
  token: string;
  usuario: Usuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'c360_token';
  private readonly USER_KEY = 'c360_user';

  constructor(private http: HttpClient, private router: Router) {}

  login(identificador: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(
        `${environment.apiUrl}/api/auth/login`,
        { identificador, password },
        { withCredentials: true }
      )
      .pipe(
        tap((res) => {
          localStorage.setItem(this.TOKEN_KEY, res.token);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.usuario));
        }),
        catchError((err) => throwError(() => err))
      );
  }

  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http
        .post(
          `${environment.apiUrl}/api/auth/logout`,
          {},
          { headers: this.authHeaders(), withCredentials: true }
        )
        .subscribe({ error: () => {} });
    }
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.router.navigate(['/login']);
  }

  me(): Observable<{ usuario: Usuario }> {
    return this.http.get<{ usuario: Usuario }>(`${environment.apiUrl}/api/auth/me`, {
      headers: this.authHeaders(),
      withCredentials: true
    });
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getUser(): Usuario | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Usuario;
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  authHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.getToken() || ''}` });
  }
}
