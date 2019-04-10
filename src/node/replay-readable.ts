import { Readable } from "stream";

type ReadableLike = Readable | { push: (chunk: any) => void, emit: (event: "error", error: Error) => void };
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
export async function createReplayReadable(initial: Readable): Promise<ReplayReadable> {
  // Return undefined if any error, as we will handle it in the next statement
  const streamModule = await getModule("stream")
    .catch(() => undefined);
  if (!streamModule) {
    // We can't make the replay readable because we can't construct a new readable
    return undefined;
  }

  const chunks: any[] = [];

  // Record any chunks that might be needed
  initial.on("data", chunk => chunks.push(chunk));
  // onEofChunk
  // tslint:disable-next-line
  initial.once("end", () => chunks.push(null));

  return async (): Promise<Readable> => {
    const duplex = new streamModule.Duplex({
      allowHalfOpen: true
    });

    // Allow pipe
    duplex._write = (chunk: any) => duplex.push(chunk);

    // Allow read
    duplex._read = () => initial.read(0);

    // Replay any _initial_ chunks
    // If this includes a null chunk, our read will end
    chunks.forEach(chunk => duplex.push(chunk));

    // Pipe any _new_ data
    initial.pipe(duplex);

    // Replay the end, because this triggers of the onend process for the duplex
    // (see https://github.com/nodejs/node/blob/b08a867d6016ccf04783a0f91fdbcc3460daf234/lib/_stream_duplex.js#L64)
    initial.once("end", () => {
      duplex.emit("end");
      // Forcefully stop any new writes
      duplex._write = () => {};
      // if end is passed null for a chunk, it wont try and write a final time
      // tslint:disable-next-line
      duplex.end(null);
    });

    // Trigger a resume of that initial
    duplex.on("resume", () => {
      // Trigger the initial to resume
      initial.resume();
    });

    return duplex;
  };
}
