import Headers, { HeadersInit } from "./headers";

export type RequestInfo = Request | string;
export type RequestMethod = "ALLOW" | "COPY" | "DELETE" | "GET" | "OPTIONS" | "PATCH" | "POST" | "PUT" | string;

export type RequestInit = {
  body?: BodyInit | null;
  headers?: HeadersInit | null;
  method?: RequestMethod;
};

class Request {

  public readonly url: string;
  public readonly method: RequestMethod;
  public readonly headers: Headers;
  public readonly body: BodyInit;

  constructor(input: RequestInfo, init?: RequestInit) {
    if (typeof input === "string") {
      this.url = input;
    } else {
      this.url = input.url;
    }
    this.method = init && init.method || "GET";
    let headerCandidate = {};
    if (init && init.headers) {
      headerCandidate = init.headers;
    } else if (input instanceof Request) {
      headerCandidate = input.headers;
    }
    this.headers = new Headers(headerCandidate);
    if (init && init.body) {
      this.body = init.body;
    } else if (input instanceof Request) {
      this.body = input.body;
    }
  }
}

export default Request;
