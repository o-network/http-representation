import Body, { BodyInit } from "./body";
import Headers, { HeadersInit } from "./headers";

export type ResponseInit = Response | {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
};

const REDIRECTED = Symbol("Redirected");
const TYPE = Symbol("Type");

class Response extends Body {

  public [REDIRECTED]: boolean = false;
  public [TYPE]: "default" | "error";

  protected editableStatus: number;
  protected editableStatusText: string;

  public get status() {
    return this.editableStatus;
  }

  public get statusText() {
    return this.editableStatusText;
  }

  constructor(body?: BodyInit, init?: ResponseInit) {
    super(body, init && init.headers);
    this.editableStatus = init ? init.status : 200;
    this.editableStatusText = init ? init.statusText : undefined;
    this[TYPE] = "default";

    if (init && typeof init.status === "number" && body && [101, 204, 205, 304].indexOf(this.status) !== -1) {
      throw new TypeError("Body provided for a null-body status");
    }
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  get redirected() {
    return this[REDIRECTED];
  }

  get type() {
    return this[TYPE];
  }

  clone(): Response {
    return new Response(
      this.body,
      this
    );
  }

  static error() {
    const response = new Response(undefined, {
      headers: Headers.guarded(undefined, "immutable")
    });
    response[TYPE] = "error";
    return response;
  }

  static redirect(url: string, status: 301 | 302 | 303 | 307 | 308 | number) {
    if ([301, 302, 303, 307, 308].indexOf(status) === -1) {
      throw new RangeError(`Invalid redirect status ${status}`);
    }
    const parsedUrl = new URL(url, "https://fetch.spec.whatwg.org");

    const response = new Response(undefined, {
      headers: Headers.guarded({ Location: parsedUrl.toString() }, "immutable"),
      status
    });
    response[REDIRECTED] = true;
    return response;
  }

}

export { Response };

export default Response;
