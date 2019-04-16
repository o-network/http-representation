import Body, { BodyInit } from "./body";
import Headers, { HeadersInit } from "./headers";

export type RequestInfo = Request | string;
export type RequestMethod = "ALLOW" | "COPY" | "DELETE" | "GET" | "OPTIONS" | "PATCH" | "POST" | "PUT" | string;

export type RequestInit = {
  body?: BodyInit | null;
  headers?: HeadersInit | null;
  method?: RequestMethod;
};

class Request extends Body {
  public readonly method: RequestMethod;
  public readonly url: string;
  public readonly body: BodyInit;

  constructor(input: RequestInfo, init?: RequestInit) {
    let headerCandidate = {};
    if (init && init.headers) {
      headerCandidate = init.headers;
    } else if (input instanceof Request) {
      headerCandidate = input.headers;
    }
    super((init && init.body) || (input instanceof Request && input.body) || undefined, headerCandidate);
    if (typeof input === "string") {
      this.url = input;
    } else {
      this.url = input.url;
    }
    this.method = init && init.method || "GET";
  }
}

export { Request };

export default Request;
