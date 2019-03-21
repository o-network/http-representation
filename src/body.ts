export type Emitter<T> = {
  on(event: "data", callback: (chunk: T) => void): void;
  on(event: "end", callback: (...args: any[]) => void): void;
};

export type BodyInit = Uint8Array | Emitter<Uint8Array> | string | any;
