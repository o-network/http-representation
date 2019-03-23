export type Emitter<T> = {
  on(event: "data", callback: (chunk: T) => void): void;
  on(event: "end", callback: (...args: any[]) => void): void;
};

export type BodyInit = Uint8Array | Blob | BufferSource | FormData | URLSearchParams | ReadableStream | string | any;

export default class Body {

  public readonly body?: ReadableStream;
  public readonly bodyUsed: boolean = false;

  constructor(body: BodyInit) {
    this.body = body;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error("Not implemented");
  }

  async blob(): Promise<Blob> {
    throw new Error("Not implemented");
  }

  async formData(): Promise<FormData> {
    throw new Error("Not implemented");
  }

  async json(): Promise<any> {
    throw new Error("Not implemented");
  }

  async text(): Promise<string> {
    throw new Error("Not implemented");
  }

}
