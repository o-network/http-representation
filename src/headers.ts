export type HeadersInit = Headers | { [key: string]: string | number | (string | number)[] } | any;

class Headers {

  private readonly headers: { [key: string]: string[] };

  constructor(headers?: HeadersInit) {
    this.headers = {};

    if (!headers) {
      return;
    }

    let workingHeaders = headers;

    if ((workingHeaders as any) instanceof Headers) {
      workingHeaders = workingHeaders.headers;
    }

    let name: string;

    const add = (fn: (name: string, value: string) => void, name: string, value: string | number) => {
      if (typeof value === "string") {
        this.set(name, value);
      } else if (typeof value === "number" && !isNaN(value)) {
        this.set(name, value.toString());
      }
    };

    for (name in workingHeaders) {
      if (!workingHeaders.hasOwnProperty(name)) {
        continue;
      }
      if (Array.isArray(workingHeaders[name])) {
        workingHeaders[name].forEach((value: string | number) => add(this.append.bind(this), name, value));
      } else {
        add(this.set.bind(this), name, workingHeaders[name]);
      }
    }

  }

  get(name: string): string {
    const values = this.headers[name.toLowerCase()];
    return values ? values[0] : undefined;
  }

  getAll(name: string): string[] {
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
    this.headers[name.toLowerCase()] = [value];
  }

  append(name: string, value: string) {
    if (!this.has(name)) {
      this.set(name, value);
      return;
    }
    this.headers[name.toLowerCase()].push(value);
  }

  has(name: string): boolean {
    return this.headers.hasOwnProperty(name.toLowerCase());
  }

  delete(name: string) {
    delete this.headers[name.toLowerCase()];
  }

}

export default Headers;
