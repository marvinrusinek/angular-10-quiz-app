import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';

export function firstValueFrom<T>(src: Observable<T>): Promise<T> {
  return src.pipe(take(1)).toPromise() as Promise<T>;
}
export function lastValueFrom<T>(src: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let seen = false, last!: T;
    src.subscribe({
      next: v => { seen = true; last = v; },
      error: reject,
      complete: () => seen ? resolve(last) : reject(new Error('No elements in sequence')),
    });
  });
}