export interface FetchResult<T> {
  data: T;
  isStale: boolean; // cached data older than 24h
  isFallback: boolean; // using hardcoded defaults (donation) or null (membership)
}
