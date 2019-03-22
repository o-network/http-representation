import { BodyInit } from "./body";
import Headers, { HeadersInit } from "./headers";

export type ResponseInit = Response | {
  status?: number;
  statusText?: string;
  headers?: HeadersInit
};

class Response {

  public readonly body: BodyInit;

  public readonly status: number;
  public readonly statusText: string;
  public readonly headers: Headers;

  constructor(body?: BodyInit, init?: ResponseInit) {
    this.body = body;
    this.status = init && init.status || 200;
    this.statusText = init && init.statusText;
    this.headers = new Headers(init && init.headers);
  }

  text(): Promise<string> {
    if (typeof this.body !== "string") {
      throw new Error("body provided was not a string. PRs Welcome");
    }
    return Promise.resolve(this.body);
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  clone(): Response {
    return new Response(
      this.body,
      this
    );
  }

}

export default Response;
