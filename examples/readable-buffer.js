const { Body, ignoreBodyUsed, asBuffer } = require('../dist'),
  { createReadStream } = require('fs');

(async () => {

  // cwd is top level of this project
  const initial = createReadStream("./package.json");

  const body = new Body(initial);

  ignoreBodyUsed(body);

  console.log('Getting buffers');
  const bufferA = await asBuffer(body);
  console.log({ bufferA });
  const bufferB = await asBuffer(body);
  console.log({ bufferB });
  console.log(bufferA === bufferB);

})()
  .then(() => console.log("Complete"))
  .catch((error) => console.error(error));

console.log('Finished');
