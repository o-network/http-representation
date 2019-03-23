export type Emitter<T> = {
  on(event: "data", callback: (chunk: T) => void): void;
  on(event: "end", callback: (...args: any[]) => void): void;
};

export type BodyInit = Uint8Array | Blob | BufferSource | FormData | URLSearchParams | ReadableStream | USVString | string | any;
