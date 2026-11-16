import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import { Link, LinksService } from './links.service';

const httpUrl: ValidatorFn = (control) => {
  if (!control.value) return null;
  try {
    const url = new URL(String(control.value).trim());
    return ['http:', 'https:'].includes(url.protocol) ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly api = inject(LinksService);
  private readonly destroyRef = inject(DestroyRef);
  private listRequest?: Subscription;
  readonly links = signal<Link[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly listError = signal('');
  readonly submitError = signal('');
  readonly result = signal<Link | null>(null);
  readonly form = new FormGroup({
    url: new FormControl('', { nonNullable: true, validators: [Validators.required, httpUrl] })
  });

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.listError.set('');
    this.listRequest = this.api.list().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (links) => this.links.set(links),
      error: (error: unknown) => this.listError.set(this.errorMessage(error, 'Could not load links.'))
    });
  }

  submit() {
    if (this.submitting()) return;
    this.submitError.set('');
    this.result.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.api.create(this.form.controls.url.value.trim()).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (link) => {
        this.result.set(link);
        this.form.reset();
        this.refresh();
      },
      error: (error: unknown) => this.submitError.set(this.errorMessage(error, 'Could not shorten this URL.'))
    });
  }

  clearSubmitFeedback() {
    this.submitError.set('');
    this.result.set(null);
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.';
      const body: unknown = error.error;
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
    }
    return `${fallback} Please try again.`;
  }
}
