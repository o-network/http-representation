import Headers, { HeadersInit } from "./headers";
import globalOrSelf from "./global-or-self";
import { Readable } from "stream";
import { createReplayReadable, ReplayReadable } from "./node/replay-readable";

export type BodyValue = Blob | FormData | ArrayBuffer | Buffer | string;

export type BodyLike = { body: BodyValue };

export type BodyInit = Uint8Array | BufferSource | URLSearchParams | Readable | BodyValue | BodyLike | string | any;

export type BodyRepresentation = {
  text?: string;
  blob?: Blob;
  formData?: FormData;
  arrayBuffer?: ArrayBuffer;
  buffer?: Buffer | Uint8Array;
  readable?: Readable;
};

// From https://github.com/github/fetch/blob/master/fetch.js
const support = {
  searchParams: "URLSearchParams" in globalOrSelf,
  iterable: "Symbol" in globalOrSelf && "iterator" in Symbol,
  blob:
    "FileReader" in globalOrSelf &&
    "Blob" in globalOrSelf &&
    (function () {
      try {
        new Blob();
        return true;
      } catch (e) {
        return false;
      }
    })(),
  formData: "FormData" in globalOrSelf,
  arrayBuffer: "ArrayBuffer" in globalOrSelf,
  buffer: "Buffer" in globalOrSelf
};

function cloneUint8Array(array: ArrayBufferLike): ArrayBufferLike {
  if (array.slice) {
    return array.slice(0);
  } else {
    const view = new Uint8Array(array.byteLength);
    view.set(new Uint8Array(array));
    return view.buffer;
  }
}

function isDataView(object: ArrayBufferLike) {
  return object && DataView.prototype.isPrototypeOf(object);
}

let isArrayBufferView: (object: ArrayBufferLike) => boolean = () => false;

if (support.arrayBuffer) {
  const viewClasses = [
    "[object Int8Array]",
    "[object Uint8Array]",
    "[object Uint8ClampedArray]",
    "[object Int16Array]",
    "[object Uint16Array]",
    "[object Int32Array]",
    "[object Uint32Array]",
    "[object Float32Array]",
    "[object Float64Array]"
  ];

  isArrayBufferView = ArrayBuffer.isView || function(object: ArrayBufferLike) {
    return object && viewClasses.indexOf(Object.prototype.toString.call(object)) > -1;
  };
}

function fileReaderReady(reader: FileReader): Promise<string | ArrayBuffer> {
  return new Promise(function(resolve, reject) {
    reader.onload = function() {
      resolve(reader.result);
    };
    reader.onerror = function() {
      reject(reader.error);
    };
  });
}

function readBufferAsArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(arrayBuffer);
  for (let index = 0; index < buffer.length; index += 1) {
    view[index] = buffer[index];
  }
  return arrayBuffer;
}

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const reader = new FileReader();
  const promise = fileReaderReady(reader);
  reader.readAsArrayBuffer(blob);
  const result = await promise;
  if (typeof result === "string") {
    return readStringAsArrayBuffer(result);
  }
  if (!result) {
    return undefined;
  }
  return result;
}

function readStringAsArrayBuffer(value: string): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(value.length * 2);
  const view = new Uint16Array(arrayBuffer);
  for (let index = 0; index < value.length; index += 1) {
    view[index] = value.charCodeAt(index);
  }
  return arrayBuffer;
}

function readStringAsFormData(value: string) {
  const form = new FormData();
  value
    .trim()
    .split("&")
    .filter(bytes => bytes)
    .forEach(bytes => {
      const split = bytes.split("=");
      const name = split.shift().replace(/\+/g, " ");
      const value = split.join("=").replace(/\+/g, " ");
      form.append(decodeURIComponent(name), decodeURIComponent(value));
    });
  return form;
}

function readArrayBufferAsText(arrayBuffer: ArrayBuffer): string {
  const view = new Uint8Array(arrayBuffer);
  return readUint8ArrayAsText(view);
}

function readUint8ArrayAsText(view: Uint8Array): string {
  const chars = new Array(view.length);
  for (let index = 0; index < view.length; index += 1) {
    chars[index] = String.fromCharCode(view[index]);
  }
  return chars.join("");
}

async function readBlobAsText(blob: Blob) {
  const reader = new FileReader();
  const promise = fileReaderReady(reader);
  reader.readAsText(blob);
  const result = await promise;
  if (typeof result === "string") {
    return result;
  }
  if (!result) {
    return "";
  }
  return readArrayBufferAsText(result);
}

async function readReadableAsBuffer(readable: Readable): Promise<Uint8Array> {
  const concat = (values: Uint8Array[]): Uint8Array => {
    if (globalOrSelf.Buffer) {
      return globalOrSelf.Buffer.concat(values);
    }
    const length = values.reduce(
      (sum, value) => sum + value.length,
      0
    );
    const view = new Uint8Array(length);
    let index = 0;
    values
      .forEach(
        (value) => {
          for (let thisIndex = 0; thisIndex < value.length; thisIndex += 1, index += 1) {
            view[index] = value[thisIndex];
          }
        }
      );
    return view;
  };

  return new Promise(
    (resolve, reject) => {
      const buffers: Uint8Array[] = [];
      readable.on("data", (value: string | Buffer) => {
        const buffer: Buffer = typeof value === "string" ? Buffer.from(value, "utf-8") : value;
        buffers.push(buffer);
      });
      readable.once("error", reject);
      readable.once("end", () => {
        resolve(concat(buffers));
      });
      readable.resume();
    }
  );
}

function getBody(body: BodyInit): BodyRepresentation {
  if (body == undefined) {
    // No body does not mean text body
    return undefined;
  }
  if (typeof body === "string") {
    return { text: body };
  }
  if (!body) {
    // Falsy? Idk
    return undefined;
  }
  if ((body.body || typeof body.body === "string")) {
    // BodyLike
    return getBody(body.body);
  }
  // Require buffer as we expect readable being only supplied in a Node.js environment
  if (support.buffer && body.readable) {
    return { readable: body };
  }
  if (body.on && body.once && body.resume) {
    return { readable: body };
  }
  if (support.buffer && Buffer.isBuffer(body)) {
    return { buffer: body };
  } else if (body instanceof Uint8Array) {
    return { buffer: body };
  }
  if (support.blob && Blob.prototype.isPrototypeOf(body)) {
    return { blob: body };
  }
  if (support.formData && FormData.prototype.isPrototypeOf(body)) {
    return { formData: body };
  }
  if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
    return { text: body.toString() };
  }
  if (support.arrayBuffer && support.blob && isDataView(body)) {
    const arrayBuffer = cloneUint8Array(body.buffer);
    const blob = new Blob([arrayBuffer]);
    return { arrayBuffer, blob };
  }
  if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
    return { arrayBuffer: cloneUint8Array(body) };
  }
  return { text: Object.prototype.toString.call(body) };
}

export function ignoreBodyUsed<T extends { ignoreBodyUsed: () => T }>(body: T): T {
  return body.ignoreBodyUsed();
}

export async function asBuffer(body: Body | ({ arrayBuffer: () => Promise<ArrayBuffer> })): Promise<Buffer | Uint8Array> {
  if ((body as any).buffer_DO_NOT_USE_NON_STANDARD) {
    return (body as any).buffer_DO_NOT_USE_NON_STANDARD();
  }
  if ((body as any).buffer instanceof Function) {
    // node-fetch support
    return (body as any).buffer();
  }
  const arrayBuffer = await body.arrayBuffer();
  if (!arrayBuffer) {
    return undefined;
  }
  if (support.buffer) {
    return globalOrSelf.Buffer.from(arrayBuffer);
  } else {
    return new Uint8Array(arrayBuffer);
  }
}

export function asReadable(body: Body | BodyLike): Promise<Readable> {
  if ((body as any).readable_DO_NOT_USE_NON_STANDARD) {
    return ((body as any).readable_DO_NOT_USE_NON_STANDARD as Function)();
  }
  // We only want to support readable if the body already has a way to handle it,
  // otherwise we're making assumptions
  throw new Error("Could not read body as Readable");
}

export async function asBestSuited(body: Body | BodyLike): Promise<BodyRepresentation> {
  if ((body as any).bestSuited_DO_NOT_USE_NON_STANDARD) {
    return (body as any).bestSuited_DO_NOT_USE_NON_STANDARD();
  }
  // Use getBody to figure out what we should really be using
  return getBody(body);
}

class Body {

  get body(): BodyValue {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    if (this.bodyRepresentation.buffer) {
      return this.bodyRepresentation.buffer;
    }
    if (this.bodyRepresentation.arrayBuffer) {
      return this.bodyRepresentation.arrayBuffer;
    }
    if (this.bodyRepresentation.formData) {
      return this.bodyRepresentation.formData;
    }
    if (this.bodyRepresentation.blob) {
      return this.bodyRepresentation.blob;
    }
    if (this.bodyRepresentation.text) {
      return this.bodyRepresentation.text;
    }
    if (this.bodyRepresentation.readable) {
      // Don't throw in an accessor
      // throw new Error("Body is using a Readable instance, to access the readable body please use asReadable, or any of the alternative accessor functions (arrayBuffer, json, text)");
      return undefined;
    }
    return undefined;
  }

  get bodyUsed(): boolean {
    return this.bodyUsedInternal;
  }

  private bodyUsedInternal: boolean = false;
  private ignoreConsume: boolean = false;

  private readonly bodyRepresentation: BodyRepresentation;
  public readonly headers: Headers;

  private readableReplay: Promise<ReplayReadable> = undefined;

  constructor(body: BodyInit, headers?: HeadersInit) {
    this.bodyRepresentation = getBody(body);
    this.headers = new Headers(headers);

    if (this.bodyRepresentation && !this.headers.has("content-type")) {
      if (typeof this.bodyRepresentation.text === "string") {
        this.headers.set("content-type", "text/plain;charset=UTF-8");
      } else if (this.bodyRepresentation.blob && this.bodyRepresentation.blob.type) {
        this.headers.set("content-type", this.bodyRepresentation.blob.type);
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this.headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
      }
    }
  }

  async readable_DO_NOT_USE_NON_STANDARD(): Promise<Readable> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    if (!support.buffer) {
      throw new Error("Not available");
    }
    if (this.bodyRepresentation.readable) {
      return this.createReadableIfRequired();
    }
    throw new Error("Required Readable body, didn't get one");
  }

  private async createReadableIfRequired(): Promise<Readable> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    if (!this.bodyRepresentation.readable) {
      return undefined;
    }
    // We aren't going to use it again, so go for it.
    if (!this.ignoreConsume) {
      return this.bodyRepresentation.readable;
    }
    if (this.readableReplay) {
      const replay = await this.readableReplay;
      if (!replay) {
        // If we have a promise, then it must have been consumed elsewhere
        throw new TypeError("Already used");
      }
      return (await this.readableReplay)();
    }
    this.readableReplay = createReplayReadable(this.bodyRepresentation.readable);
    const replay = await this.readableReplay;
    if (replay) {
      return replay();
    }
    if (this.bodyUsedInternal) {
      throw new TypeError("Already used");
    }
    // If we can't replay, then lets just returned the initial,
    // just can't be used multiple times
    this.bodyUsedInternal = true;
    return this.bodyRepresentation.readable;
  }

  async buffer_DO_NOT_USE_NON_STANDARD(): Promise<Uint8Array> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    if (this.bodyRepresentation.readable) {
      return readReadableAsBuffer(
        await this.createReadableIfRequired()
      );
    }
    if (this.bodyRepresentation.buffer) {
      return this.bodyRepresentation.buffer;
    }
    if (typeof this.bodyRepresentation.text === "string") {
      return Buffer.from(this.bodyRepresentation.text, "utf-8");
    }
    try {
      const arrayBuffer = await this.arrayBuffer();
      if (support.buffer) {
        return globalOrSelf.Buffer.from(arrayBuffer);
      } else {
        return new Uint8Array(arrayBuffer);
      }
    } catch (e) {
      // We don't want to have a confusing message, so remap to this
      throw new Error("Could not read body as Buffer");
    }
  }

  async bestSuited_DO_NOT_USE_NON_STANDARD(): Promise<BodyRepresentation> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    // Clone if needed
    if (this.bodyRepresentation.readable) {
      return { readable: await this.createReadableIfRequired() };
    }
    return this.bodyRepresentation;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    if (!support.arrayBuffer) {
      throw new Error("Not available");
    }
    if (this.bodyRepresentation.readable) {
      return readBufferAsArrayBuffer(
        await readReadableAsBuffer(this.bodyRepresentation.readable)
      );
    }
    if (this.bodyRepresentation.buffer) {
      return readBufferAsArrayBuffer(this.bodyRepresentation.buffer);
    }
    // This should be the case for Node.js
    if (this.bodyRepresentation.arrayBuffer) {
      return this.bodyRepresentation.arrayBuffer;
    }
    if (typeof this.bodyRepresentation.text === "string") {
      return readStringAsArrayBuffer(this.bodyRepresentation.text);
    }
    try {
      // This could lead to undefined being returned
      // As FileReader could return null which is swapped out
      return readBlobAsArrayBuffer(
        await this.blob()
      );
    } catch (e) {
      // We don't want to have a confusing message, so remap to this
      throw new Error("Could not read body as ArrayBuffer");
    }
  }

  async blob(): Promise<Blob> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    if (!support.blob) {
      throw new Error("Not available");
    }
    if (this.bodyRepresentation.blob) {
      return this.bodyRepresentation.blob;
    }
    if (this.bodyRepresentation.readable) {
      return new Blob([
        readBufferAsArrayBuffer(
          await readReadableAsBuffer(
            this.bodyRepresentation.readable
          )
        )
      ]);
    }
    // I don't think any environment that supports buffer & blob?
    if (this.bodyRepresentation.buffer) {
      return new Blob([readBufferAsArrayBuffer(this.bodyRepresentation.buffer)]);
    }
    if (this.bodyRepresentation.arrayBuffer) {
      return new Blob([this.bodyRepresentation.arrayBuffer]);
    }
    if (typeof this.bodyRepresentation.text !== "string") {
      throw new Error("Could not read body as Blob");
    }
    return new Blob([this.bodyRepresentation.text]);
  }

  async formData(): Promise<FormData> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    if (!support.formData) {
      throw new Error("Not available");
    }
    if (this.bodyRepresentation.formData) {
      return this.bodyRepresentation.formData;
    }
    try {
      return readStringAsFormData(
        await this.textNoConsumeCheck()
      );
    } catch (e) {
      // We don't want to have a confusing message, so remap to this
      throw new Error("Could not read body as FormData");
    }
  }

  async json(): Promise<any> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    try {
      const text = await this.textNoConsumeCheck();
      return JSON.parse(text);
    } catch (e) {
      // We don't want to have a confusing message, so remap to this
      throw new Error("Could not read body as json");
    }
  }

  async text(): Promise<string> {
    if (!this.bodyRepresentation) {
      return undefined;
    }
    const rejected = this.consumed();
    if (rejected) {
      return rejected;
    }
    return this.textNoConsumeCheck();
  }

  private async textNoConsumeCheck(): Promise<string> {
    if (this.bodyRepresentation.readable) {
      const buffer = await readReadableAsBuffer(
        await this.createReadableIfRequired()
      );
      return buffer.toString("utf-8");
    }
    if (support.buffer && this.bodyRepresentation.buffer) {
      return this.bodyRepresentation.buffer.toString("utf-8");
    } else if (this.bodyRepresentation.buffer) {
      return readUint8ArrayAsText(this.bodyRepresentation.buffer);
    }
    if (this.bodyRepresentation.blob) {
      return readBlobAsText(this.bodyRepresentation.blob);
    }
    if (this.bodyRepresentation.arrayBuffer) {
      return readArrayBufferAsText(this.bodyRepresentation.arrayBuffer);
    }
    if (typeof this.bodyRepresentation.text !== "string") {
      throw new Error("Could not read body as text");
    }
    return this.bodyRepresentation.text;
  }

  private consumed(): Promise<any> {
    // We can use the symbol here as we only care about this instance
    if (this.bodyUsedInternal) {
      return Promise.reject(new TypeError("Already read"));
    }
    // Can only ignore after the body has been used
    if (this.ignoreConsume) {
      return undefined;
    }
    this.bodyUsedInternal = true;
    return undefined;
  }

  public ignoreBodyUsed(): this {
    if (this.bodyUsedInternal || this.ignoreConsume) {
      return this;
    }
    this.ignoreConsume = true;
    return this;
  }

}

export { Body };

export default Body;
