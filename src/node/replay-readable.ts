import { Readable } from "stream";

type AddEventListener = (event: string, callback: (...args: any[]) => void) => void;

type ReadableLike = Readable | { resume: () => any, pipe: () => any, read: () => any, on: AddEventListener, once: AddEventListener, push: (chunk: any) => void, emit: (event: "error", error: Error) => void };

export type ReplayReadable = () => Promise<Readable>;

async function getModule(module: string) {
  // If require is available, we aren't using esm
  if (typeof require === "function") {
    return require(module);
  }
  // Eval the import syntax, as if in esm but no dynamic import, we may run into a syntax error
  const fn = new Function("module", "return import(module);");
  return fn(module);
}

/**
 * This will create a function that can create a readable stream and replay data from the initial
 * stream.
 *
 * If the stream module isn't available in the environment (either via require or import) then
 * no function will be returned, in which case the initial readable can't be replayed, this
 * should only happen for non Node.js environments
 *
 * @param initial
 */
export async function createReplayReadable(initial: ReadableLike): Promise<ReplayReadable> {
  // Return undefined if any error, as we will handle it in the next statement
  const streamModule = await getModule("stream")
    .catch(() => undefined);
  if (!streamModule) {
    // We can't make the replay readable because we can't construct a new readable
    return undefined;
  }

  const chunks: any[] = [];

  let error: Error = undefined,
    ended = false;

  // Record any chunks that might be needed
  initial.on("data", chunk => chunks.push(chunk));
  initial.once("end", () => {
    // tslint:disable-next-line
    chunks.push(null);
    ended = true;
  });
  // Pick up on any errors and replay them once they resume
  initial.once("error", value => error = value);

  return async (): Promise<Readable> => {
    const result = new streamModule.PassThrough();

    // Anything missed
    chunks.forEach(chunk => result.push(chunk));

    if (error) {
      result.emit();
    } else if (!ended) {
      initial.pipe(result);
    }

    return result;
  };
}
