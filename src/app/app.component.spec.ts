import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AppComponent } from './app.component';
import { Link, LinksService } from './links.service';

describe('Snip form and links table', () => {
  const link: Link = {
    code: 'Ab12Cd', url: 'https://example.com/a', shortUrl: 'http://localhost:3000/Ab12Cd',
    hits: 0, createdAt: '2026-11-16T00:00:00.000Z'
  };
  let api: jasmine.SpyObj<LinksService>;
  let fixture: ComponentFixture<AppComponent>;
  let app: AppComponent;
  let page: HTMLElement;

  beforeEach(async () => {
    api = jasmine.createSpyObj<LinksService>('LinksService', ['list', 'create']);
    api.list.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: LinksService, useValue: api }]
    }).compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    page = fixture.nativeElement;
  });

  function submit(url: string) {
    app.form.controls.url.setValue(url);
    page.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  it('rejects missing, relative, malformed and non-HTTP URLs before making a request', () => {
    fixture.detectChanges();
    for (const url of ['', '/relative', 'not a URL', 'javascript:alert(1)', 'ftp://example.com']) {
      submit(url);
      expect(app.form.invalid).withContext(url).toBeTrue();
    }
    expect(api.create).not.toHaveBeenCalled();
    expect(page.querySelector('#url-error')?.textContent).toContain('valid HTTP or HTTPS');
  });

  it('trims a valid URL, shows the returned link and refreshes the table on success', () => {
    fixture.detectChanges();
    api.create.and.returnValue(of(link));
    api.list.and.returnValue(of([link]));
    submit('  https://example.com/a  ');
    expect(api.create).toHaveBeenCalledOnceWith(link.url);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(page.querySelector('.success a')?.getAttribute('href')).toBe(link.shortUrl);
    expect(page.querySelector('tbody')?.textContent).toContain(link.url);
    expect(page.querySelector('tbody .hits')?.textContent).toBe('0');
    expect(app.form.controls.url.value).toBe('');
  });

  it('prevents duplicate submissions while pending and re-enables afterward', () => {
    const pending = new Subject<Link>();
    api.create.and.returnValue(pending);
    fixture.detectChanges();
    submit('http://example.com');
    submit('http://example.com');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBeTrue();
    pending.next(link);
    pending.complete();
    fixture.detectChanges();
    expect(page.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBeFalse();
  });

  it('shows server validation errors beside the field and retains input for retry', () => {
    fixture.detectChanges();
    api.create.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { error: 'url must be a valid HTTP(S) URL' }
    })));
    submit(link.url);
    expect(page.querySelector('#url-error')?.textContent).toContain('url must be a valid HTTP(S) URL');
    expect(app.form.controls.url.value).toBe(link.url);
    expect(app.submitting()).toBeFalse();
    expect(api.list).toHaveBeenCalledTimes(1);
    app.clearSubmitFeedback();
    expect(app.submitError()).toBe('');
  });

  it('shows network failures and allows a subsequent successful submission', () => {
    fixture.detectChanges();
    api.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    submit(link.url);
    expect(page.querySelector('#url-error')?.textContent).toContain('Cannot reach the server');
    api.create.and.returnValue(of(link));
    submit(link.url);
    expect(app.result()).toEqual(link);
    expect(app.submitError()).toBe('');
  });

  it('shows loading, list failure, retry and empty states', () => {
    const pending = new Subject<Link[]>();
    api.list.and.returnValue(pending);
    fixture.detectChanges();
    expect(page.textContent).toContain('Loading links...');
    pending.error(new HttpErrorResponse({ status: 503 }));
    fixture.detectChanges();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Could not load links');
    api.list.and.returnValue(of([]));
    page.querySelector<HTMLButtonElement>('.secondary')?.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.textContent).toContain('No links yet');
  });

  it('replaces an older pending list request after a successful creation', () => {
    const initial = new Subject<Link[]>();
    api.list.and.returnValue(initial);
    fixture.detectChanges();
    api.list.and.returnValue(of([link]));
    api.create.and.returnValue(of(link));
    submit(link.url);
    initial.next([]);
    expect(app.links()).toEqual([link]);
    expect(app.loading()).toBeFalse();
  });
});
