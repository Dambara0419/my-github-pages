// base パス（/my-github-pages）付きの URL を作る
export const withBase = (path: string = ''): string =>
  `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
