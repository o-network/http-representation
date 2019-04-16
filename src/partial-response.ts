import Response, { ResponseInit } from "./response";

export type PartialResponseInit = PartialResponse | ResponseInit;

class PartialResponse extends Response {

  // Flag so we know its not expected to be the response
  // just a part of it
  public readonly partial = true;

  constructor(body?: BodyInit, init?: PartialResponseInit) {
    super(body, init);

    // As we default to 200 in response
    if (!(init && typeof init.status === "number")) {
      this.editableStatus = undefined;
    }

    // Partial responses are non-spec, so we can pre-mark it as re-usable
    this.ignoreBodyUsed();
  }

}

export { PartialResponse };

export default PartialResponse;
