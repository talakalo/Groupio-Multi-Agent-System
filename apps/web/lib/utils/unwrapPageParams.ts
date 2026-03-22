import { use } from 'react';

const EMPTY = Promise.resolve({} as Record<string, string | string[]>);

/**
 * Next.js 15: params and searchParams are async.
 * Unwrap them at the top of client pages/layouts to avoid
 * "params/searchParams are being enumerated" when dev tools serialize props.
 */
export function unwrapPageParams(props: {
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
}): void {
  use(props.params ?? EMPTY);
  use(props.searchParams ?? EMPTY);
}

export type PageParamsProps = {
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};
