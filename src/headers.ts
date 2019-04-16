export type HeaderValue = string | number | (string | number)[];
export type HeadersInitObject = { [key: string]: HeaderValue[] };
export type HeadersInitArray = [string, HeaderValue][];

export type HeadersInit = Headers | HeadersInitObject | HeadersInitArray | any;

export type HeadersGuard = "immutable" | "request" | "response";

// From https://github.com/bitinn/node-fetch/blob/master/src/headers.js
const invalidTokenRegex = /[^\^_`a-zA-Z\-0-9!#$%&'*+.|~]/;
const invalidHeaderCharRegex = /[^\t\x20-\x7e\x80-\xff]/;

function validateName(name: string) {
  if (typeof name !== "string" || invalidTokenRegex.test(name) || name === "") {
    throw new TypeError(`${name} is not a legal HTTP header name`);
  }
}

function validateValue(value: string) {
  if (typeof value !== "string" || invalidHeaderCharRegex.test(value)) {
    throw new TypeError(`${value} is not a legal HTTP header value`);
  }
}

function appendValues(instance: Headers, key: string, value: HeaderValue) {
  if (Array.isArray(value)) {
    value.forEach((item: HeaderValue) => appendValues(instance, key, value));
  } else if (typeof value === "string") {
    instance.append(key, value);
  } else if (typeof value === "number" && !isNaN(value)) {
    instance.append(key, value.toString());
  }
}

function addHeadersObject(instance: Headers, headers: HeadersInitObject) {
  for (const key of Object.keys(headers)) {
    const value: HeaderValue = headers[key] as any;
    appendValues(instance, key, value);
  }
}

function addHeadersArray(instance: Headers, headers: [string, HeaderValue][]) {
  const method = headers[Symbol.iterator];
  if (typeof method !== "function") {
    throw new TypeError("Header pairs must be iterable");
  }
  const pairs: [string, HeaderValue][] = [];
  for (const pair of headers) {
    if (typeof pair !== "object" || typeof pair[Symbol.iterator] !== "function") {
      throw new TypeError("Each header pair must be iterable");
    }
    pairs.push(Array.from(pair) as any);
  }
  pairs.forEach(
    ([ key, value, ...rest ]) => {
      if (rest.length) {
        throw new TypeError("Each header pair must be a name/value tuple");
      }
      appendValues(instance, key, value);
    }
  );
}

function addHeadersInstance(instance: Headers, headers: Headers) {
  headers.forEach(
    (value: string, key: string) => instance.append(key, value)
  );
}

function isHeadersInstanceLike(value: HeadersInit) {
  return (
    value &&
    (value.forEach as any) instanceof Function &&
    (value.has as any) instanceof Function &&
    (value.get as any) instanceof Function &&
    (value.set as any) instanceof Function &&
    (value.entries as any) instanceof Function &&
    (value.keys as any) instanceof Function &&
    (value.values as any) instanceof Function
  );
}

function addHeaders(instance: Headers, headers: HeadersInit) {
  if (!headers) {
    return;
  } else if (isHeadersInstanceLike(headers)) {
    addHeadersInstance(instance, headers);
  } else if (typeof headers === "object") {
    const iterator = headers[Symbol.iterator];
    if (iterator) {
      addHeadersArray(instance, headers);
    } else {
      addHeadersObject(instance, headers);
    }
  }
}

const FORBIDDEN_REQUEST_HEADER_NAMES = [
  "accept-charset",
  "accept-encoding",
  "access-control-request-headers",
  "access-control-request-method",
  "connection",
  "content-length",
  "cookie",
  "cookie2",
  "date",
  "dnt",
  "expect",
  "host",
  "keep-alive",
  "origin",
  "referer",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via"
];

const FORBIDDEN_RESPONSE_HEADER_NAMES = [
  "set-cookie",
  "set-cookie2"
];

function guard(instance: Headers, fnName: string , mode: HeadersGuard) {
  const fn: (name: string, ...args: any[]) => any = (instance as any)[fnName];
  return function(name: string, ...args: any[]): any {
    if (mode === "immutable") {
      throw new TypeError(`Failed to execute '${fnName}' on 'Headers': Headers are immutable`);
    }
    if (mode === "request" && FORBIDDEN_REQUEST_HEADER_NAMES.indexOf(name.toLowerCase()) !== -1) {
      throw new TypeError(`Failed to execute '${fnName}' on 'Headers': Header ${name} is not allowed in ${mode} guard mode`);
    }
    if (mode === "response" && FORBIDDEN_RESPONSE_HEADER_NAMES.indexOf(name.toLowerCase()) !== -1) {
      throw new TypeError(`Failed to execute '${fnName}' on 'Headers': Header ${name} is not allowed in ${mode} guard mode`);
    }
    return fn.call(this, name, ...args);
  };
}

class Headers {

  static guarded(headers?: HeadersInit, mode: HeadersGuard = "immutable") {
    const instance = new Headers(headers);
    instance.set = guard(instance, "set", mode);
    instance.append = guard(instance, "append", mode);
    instance.delete = guard(instance, "delete", mode);
    return instance;
  }

  private readonly headers: { [key: string]: string[] };

  constructor(headers?: HeadersInit) {
    this.headers = {};
    addHeaders(this, headers);
  }

  get(name: string): string {
    validateName(name);
    const values = this.headers[name.toLowerCase()];
    return values ? values[0] : undefined;
  }

  getAll(name: string): string[] {
    validateName(name);
    if (!this.has(name)) {
      return [];
    }
    return this.headers[name.toLowerCase()];
  }

  forEach(callback: (value: string, key: string, parent: Headers) => void, thisArg?: any) {
    Object.getOwnPropertyNames(this.headers)
      .forEach(
        (name) => {
          this.headers[name].forEach((value) => {
            callback.call(thisArg, value, name, this);
          });
        }
      );
  }

  set(name: string, value: string) {
    validateName(name);
    validateValue(value);
    this.headers[name.toLowerCase()] = [value];
  }

  append(name: string, value: string) {
    validateName(name);
    validateValue(value);
    if (!this.has(name)) {
      this.set(name, value);
      return;
    }
    this.headers[name.toLowerCase()].push(value);
  }

  has(name: string): boolean {
    validateName(name);
    return this.headers.hasOwnProperty(name.toLowerCase());
  }

  delete(name: string) {
    validateName(name);
    delete this.headers[name.toLowerCase()];
  }

  private getIterator(type: "key" | "value" | "pairs"): Iterable<string | [string, string]> {
    const result: (string | [string, string])[] = [];
    this.forEach(
      (value: string, key: string) => {
        if (type === "key" && result.indexOf(key) === -1) {
          // We don't want repeating keys, so only include if it wasn't
          // already included
          result.push(key);
        } else if (type === "value") {
          result.push(value);
        } else if (type === "pairs") {
          result.push([key, value]);
        }
      }
    );
    return (result[Symbol.iterator]() as any) as Iterable<string | [string, string]>;
  }

  keys(): Iterable<string> {
    return this.getIterator("key") as Iterable<string>;
  }

  values(): Iterable<string> {
    return this.getIterator("value") as Iterable<string>;
  }

  entries(): Iterable<[string, string]> {
    return this.getIterator("pairs") as Iterable<[string, string]>;
  }

  [Symbol.iterator](): Iterable<[string, string]> {
    return this.entries();
  }

}

Object.defineProperty(Headers.prototype, Symbol.toStringTag, {
  value: "Headers",
  writable: false,
  enumerable: false,
  configurable: true
});

export { Headers };

export default Headers;
