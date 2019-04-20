import Headers from "./headers";
import PartialResponse from "./partial-response";
import Response  from "./response";
import { asReadable, BodyInit } from "./body";

export type ResponseBuilderHeaderProcessor = (headers: Headers) => HeadersInit;

export type ResponseBuilderOptions = {
  ignoreSubsequentFullResponses?: boolean;
  replaceSubsequentFullResponses?: boolean;
  disableReadableCheck?: boolean;
  processHeaders?: ResponseBuilderHeaderProcessor;
  useSetForEntityHeaders?: boolean;
  entityHeaders?: string[];
};

class ResponseBuilder {

  private editableResponses: (Response | PartialResponse)[] = [];
  private fullResponseAppended: boolean = false;

  private readonly ignoreSubsequentFullResponses: boolean = false;
  private readonly replaceSubsequentFullResponses: boolean = false;
  private readonly disableReadableCheck: boolean = false;
  private readonly useSetForEntityHeaders: boolean = false;
  private readonly entityHeaders: string[] = undefined;
  private readonly processHeaders: ResponseBuilderHeaderProcessor = undefined;

  private response: Promise<Response> = undefined;
  private contaminated: boolean = false;

  constructor(options?: ResponseBuilderOptions) {

    if (options && options.ignoreSubsequentFullResponses) {
      this.ignoreSubsequentFullResponses = options.ignoreSubsequentFullResponses;
    }
    if (options && options.replaceSubsequentFullResponses) {
      if (this.ignoreSubsequentFullResponses) {
        throw new Error("ResponseBuilder only accepts ignoreSubsequentFullResponses or replaceSubsequentFullResponses, not both");
      }
      this.replaceSubsequentFullResponses = true;
    }
    if (options && options.disableReadableCheck) {
      this.disableReadableCheck = true;
    }
    if (options && options.processHeaders) {
      this.processHeaders = options.processHeaders;
    }
    if (options && options.useSetForEntityHeaders) {
      this.useSetForEntityHeaders = options.useSetForEntityHeaders;
    }
  }

  get responses(): (Response | PartialResponse)[] {
    // Slice so they external can't modify private variable
    return this.editableResponses.slice();
  }

  withHeaders(...headers: (Headers | HeadersInit)[]): this {
    const responses = headers
      .filter(value => value != undefined)
      .map(headers => new PartialResponse(undefined, { headers: new Headers(headers) }));
    return this.with(...responses);
  }

  private withSingle(response: Response | PartialResponse) {
    if (!response) {
      // Not contaminated as it has no effect, but we want to record
      // that we had an undefined response at this layer
      this.editableResponses.push(undefined);
      return;
    }
    if (!(response as PartialResponse).partial) {
      if (this.fullResponseAppended && this.ignoreSubsequentFullResponses) {
        return this;
      } else if (this.fullResponseAppended && this.replaceSubsequentFullResponses) {
        // By filtering out any not partial, and we would be replacing
        this.editableResponses = this.editableResponses
          .filter((response: PartialResponse) => response.partial);
      } else if (this.fullResponseAppended) {
        throw new Error("ResponseBuilder already contains a full response, and subsequent full responses are not acceptable");
      } else {
        this.fullResponseAppended = true;
      }
    }
    this.contaminated = true;
    this.editableResponses.push(response);
  }

  with(...responses: (Response | PartialResponse)[]): this {
    responses
      .forEach(response => this.withSingle(response));
    return this;
  }

  clear(): this {
    // Escape so they can be reshuffled externally using responses + clear + with
    this.editableResponses = [];
    this.response = undefined;
    this.contaminated = false;
    return this;
  }

  build(): Promise<Response> {
    if (!this.contaminated && this.response) {
      return this.response;
    }
    // Cache so that we don't need to build every time if we haven't touched anything
    this.response = this.join(this.editableResponses.filter(value => value));
    this.contaminated = false;
    return this.response;
  }

  private async join(responses: (PartialResponse | Response)[]): Promise<Response> {
    let body: BodyInit = undefined,
      status: number = undefined,
      statusText: string = undefined;

    const fullResponse = responses
      .find((response: PartialResponse) => !response.partial);

    if (fullResponse) {
      if (fullResponse.bodyUsed) {
        throw new Error("Provided full response but the body was already used");
      }
      body = fullResponse.body;
      status = fullResponse.status;
      statusText = fullResponse.statusText;
    }

    const headers = new Headers();

    const entityHeaders = this.entityHeaders || [
      "content-type",
      "content-length",
      "content-encoding",
      "content-disposition",
      "content-language",
      "content-location"
    ];

    const addResponse = async (response: PartialResponse) => {
      // Append everything
      response.headers.forEach((value, name) => {
        if (this.useSetForEntityHeaders && entityHeaders.includes(name.toLowerCase())) {
          headers.set(name, value);
        } else {
          headers.append(name, value);
        }
      });

      if (fullResponse) {
        // We already have a response, so no need to get the body or status code
        return;
      }

      if (response.bodyUsed) {
        // Already used, we can't re-use it
        return;
      }

      let currentBody: BodyInit = response.body;

      if (currentBody == undefined && !this.disableReadableCheck) {
        try {
          // This will also consume the body! Shouldn't be a problem as this should be the only consumer of the bodies
          // If we're dealing with partial responses, the body is re-usable either way
          currentBody = await asReadable(response);
        } catch (e) {
          // We will get an error if the body isn't readable
        }
      }

      if (currentBody != undefined || typeof currentBody === "string") {
        body = currentBody;
      } else {
        return;
      }

      // We're only going to use the status value if we're using the body from the response
      if (typeof response.status === "number") {
        status = response.status;
        // Override the status text
        statusText = response.statusText;
      }
    };

    await responses.reduce(
      async (promise: Promise<any>, response: PartialResponse) => {
        await promise;
        return addResponse(response);
      },
      Promise.resolve(undefined)
    );

    return new Response(body, {
      headers: (this.processHeaders ? this.processHeaders(headers) : undefined) || headers,
      status,
      statusText
    });
  }

}

export { ResponseBuilder };

export default ResponseBuilder;
