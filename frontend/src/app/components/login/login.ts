import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ThemeService } from '../../services/theme';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class LoginComponent implements OnInit {
  form!: FormGroup;
  loading = signal(false);
  error = signal('');
  showPass = signal(false);

  get theme$() {
    return this.themeService.theme$;
  }

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private themeService: ThemeService
  ) {}

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/dashboard/resumen']);
      return;
    }
    this.form = this.fb.group({
      identificador: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.loading()) return;

    this.error.set('');
    this.loading.set(true);

    const { identificador, password } = this.form.value;
    this.auth.login(identificador, password).subscribe({
      next: () => this.router.navigate(['/dashboard/resumen']),
      error: (err) => {
        this.loading.set(false);
        const msg =
          err?.error?.mensaje ||
          err?.error?.error ||
          'Credenciales incorrectas. Verifique su usuario y contraseña.';
        this.error.set(msg);
      }
    });
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  togglePass(): void {
    this.showPass.update((v) => !v);
  }

  get idCtrl() {
    return this.form.get('identificador')!;
  }
  get passCtrl() {
    return this.form.get('password')!;
  }
}
