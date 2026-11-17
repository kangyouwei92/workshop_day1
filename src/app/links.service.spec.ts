import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { LinksService } from './links.service';

describe('LinksService API contract', () => {
  let service: LinksService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(LinksService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists records using GET /api/links', () => {
    service.list().subscribe((links) => expect(links).toEqual([]));
    const request = http.expectOne(`${environment.apiBaseUrl}/api/links`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('posts only the URL and returns the complete link record', () => {
    const link = { code: 'Ab12Cd', url: 'https://example.com', shortUrl: 'http://localhost:3000/Ab12Cd', hits: 0, createdAt: '2026-11-16T00:00:00.000Z' };
    service.create(link.url).subscribe((created) => expect(created).toEqual(link));
    const request = http.expectOne(`${environment.apiBaseUrl}/api/links`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ url: link.url });
    request.flush(link, { status: 201, statusText: 'Created' });
  });
});
